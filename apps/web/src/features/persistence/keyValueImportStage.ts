import type {
  ImportReadOptions,
  ImportStage,
  ImportStageProgress,
  ImportStageState,
} from "../../../../../packages/ynab4-importer/src/source";
import type { KeyValueStoragePort } from "./keyValueStoragePort";
import type { KeyValueStorageMutation } from "./keyValueStoragePort";

const STAGE_PREFIX = "budget-app.import-stage.v1.";
export type StagedKeyValue = Readonly<{ key: string; value: string }>;

interface StageManifest {
  version: 2;
  id: string;
  state: ImportStageState;
  targetPrefix: string;
  stagedKeyCount: number;
  promotedKeyCount: number;
  batchesPersisted: number;
  recordsPersisted: number;
}

export interface KeyValueImportStageOptions {
  storage: KeyValueStoragePort;
  id: string;
  targetPrefix: string;
  allowOverwrite?: (key: string) => boolean;
}

export interface KeyValueImportStageResult {
  id: string;
  keysPromoted: number;
  recordsPersisted: number;
}

function assertNotAborted(options?: ImportReadOptions): void {
  options?.signal?.throwIfAborted();
}

function validateSegment(value: string, name: string): void {
  if (!value || !/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new TypeError(`${name} must contain only letters, numbers, dot, dash or underscore.`);
  }
}

export class KeyValueImportStage
  implements ImportStage<StagedKeyValue, KeyValueImportStageResult>
{
  private state: ImportStageState = "new";
  private batchesPersisted = 0;
  private recordsPersisted = 0;
  private readonly stagePrefix: string;
  private readonly manifestKey: string;
  private readonly stagedKeys = new Set<string>();
  private readonly promotedKeys = new Set<string>();
  private readonly overwrittenValues = new Map<string, string>();

  constructor(private readonly options: KeyValueImportStageOptions) {
    validateSegment(options.id, "id");
    if (!options.targetPrefix) throw new TypeError("targetPrefix must not be empty.");
    this.stagePrefix = `${STAGE_PREFIX}${options.id}.data.`;
    this.manifestKey = `${STAGE_PREFIX}${options.id}.manifest`;
  }

  async begin(options?: ImportReadOptions): Promise<void> {
    assertNotAborted(options);
    if (this.state !== "new") throw new Error(`Cannot begin import stage in state ${this.state}.`);
    this.state = "staging";
    this.writeManifest();
    await this.options.storage.flush?.();
  }

  async persistBatch(
    records: readonly StagedKeyValue[],
    options?: ImportReadOptions,
  ): Promise<void> {
    assertNotAborted(options);
    if (this.state !== "staging") throw new Error(`Cannot persist import batch in state ${this.state}.`);
    const batchKeys = new Set<string>();
    const mutations: KeyValueStorageMutation[] = [];
    for (const record of records) {
      assertNotAborted(options);
      if (!record.key.startsWith(this.options.targetPrefix)) {
        throw new Error(`Staged key is outside the target namespace: ${record.key}`);
      }
      if (batchKeys.has(record.key) || this.stagedKeys.has(record.key)) {
        throw new Error(`Duplicate staged key: ${record.key}`);
      }
      batchKeys.add(record.key);
      mutations.push({
        type: "set",
        key: this.stageKey(record.key),
        value: record.value,
      });
      this.stagedKeys.add(record.key);
    }
    this.batchesPersisted += 1;
    this.recordsPersisted += records.length;
    if (this.options.storage.applyMutations) {
      mutations.push({
        type: "set",
        key: this.manifestKey,
        value: this.manifestValue(),
      });
      await this.options.storage.applyMutations(mutations);
    } else {
      for (const mutation of mutations) {
        if (mutation.type === "set") {
          this.options.storage.setItem(mutation.key, mutation.value);
        }
      }
      this.writeManifest();
      await this.options.storage.flush?.();
    }
  }

  async commit(options?: ImportReadOptions): Promise<KeyValueImportStageResult> {
    assertNotAborted(options);
    if (this.state !== "staging") throw new Error(`Cannot commit import stage in state ${this.state}.`);
    this.state = "committing";
    this.writeManifest();
    try {
      if (this.options.storage.applyMutations) {
        await this.commitInBatches(options);
      } else {
      for (const key of this.stagedKeys) {
        assertNotAborted(options);
        const existingValue = this.options.storage.getItem(key);
        if (
          existingValue !== null &&
          !this.options.allowOverwrite?.(key)
        ) {
          throw new Error(`Refusing to overwrite live import target: ${key}`);
        }
        if (existingValue !== null) {
          this.overwrittenValues.set(key, existingValue);
        }
        const value = this.options.storage.getItem(this.stageKey(key));
        if (value === null) throw new Error(`Staged value disappeared before commit: ${key}`);
        this.options.storage.setItem(key, value);
        this.promotedKeys.add(key);
        // Release the staged copy immediately. Keeping every staged value until
        // the end doubles peak browser memory for large imports.
        this.options.storage.removeItem(this.stageKey(key));
        this.stagedKeys.delete(key);
      }
      }
      await this.options.storage.flush?.();
      this.state = "committed";
      this.writeManifest();
      await this.options.storage.flush?.();
      const result = {
        id: this.options.id,
        keysPromoted: this.promotedKeys.size,
        recordsPersisted: this.recordsPersisted,
      };
      await this.cleanup();
      this.promotedKeys.clear();
      return result;
    } catch (error) {
      await this.rollback(error);
      throw error;
    }
  }

  async rollback(_cause: unknown): Promise<void> {
    if (this.state === "rolled-back" || this.state === "closed") return;
    if (this.state === "committed") throw new Error("A committed import stage cannot be rolled back.");
    this.state = "rolling-back";
    this.writeManifest();
    for (const key of this.promotedKeys) {
      const original = this.overwrittenValues.get(key);
      if (original === undefined) this.options.storage.removeItem(key);
      else this.options.storage.setItem(key, original);
    }
    await this.cleanupData();
    this.overwrittenValues.clear();
    this.state = "rolled-back";
    this.writeManifest();
    await this.options.storage.flush?.();
  }

  async cleanup(): Promise<void> {
    await this.cleanupData();
    this.overwrittenValues.clear();
    this.options.storage.removeItem(this.manifestKey);
    await this.options.storage.flush?.();
  }

  progress(): ImportStageProgress {
    return {
      state: this.state,
      batchesPersisted: this.batchesPersisted,
      recordsPersisted: this.recordsPersisted,
    };
  }

  /** Read staged values through their eventual live keys before promotion. */
  createReadView(): KeyValueStoragePort {
    return {
      getItem: (key) => this.options.storage.getItem(this.stageKey(key)),
      setItem: () => { throw new Error("Import stage read view is read-only."); },
      removeItem: () => { throw new Error("Import stage read view is read-only."); },
      listKeys: () => [...this.stagedKeys],
    };
  }

  async close(): Promise<void> {
    if (!["committed", "rolled-back", "closed"].includes(this.state)) {
      await this.rollback(new Error("Import stage closed before commit."));
    }
    this.state = "closed";
  }

  private stageKey(targetKey: string): string {
    return `${this.stagePrefix}${encodeURIComponent(targetKey)}`;
  }

  private async cleanupData(): Promise<void> {
    for (const key of this.stagedKeys) this.options.storage.removeItem(this.stageKey(key));
    await this.options.storage.flush?.();
  }

  private writeManifest(): void {
    this.options.storage.setItem(this.manifestKey, this.manifestValue());
  }

  private manifestValue(): string {
    const manifest: StageManifest = {
      version: 2,
      id: this.options.id,
      state: this.state,
      targetPrefix: this.options.targetPrefix,
      stagedKeyCount: this.stagedKeys.size,
      promotedKeyCount: this.promotedKeys.size,
      batchesPersisted: this.batchesPersisted,
      recordsPersisted: this.recordsPersisted,
    };
    return JSON.stringify(manifest);
  }

  private async commitInBatches(options?: ImportReadOptions): Promise<void> {
    const keys = [...this.stagedKeys];
    for (const key of keys) {
      const existingValue = this.options.storage.getItem(key);
      if (existingValue !== null && !this.options.allowOverwrite?.(key)) {
        throw new Error(`Refusing to overwrite live import target: ${key}`);
      }
      if (existingValue !== null) this.overwrittenValues.set(key, existingValue);
    }
    const promotionBatchSize = 500;
    for (let offset = 0; offset < keys.length; offset += promotionBatchSize) {
      assertNotAborted(options);
      const batch = keys.slice(offset, offset + promotionBatchSize);
      const mutations: KeyValueStorageMutation[] = [];
      for (const key of batch) {
        const value = this.options.storage.getItem(this.stageKey(key));
        if (value === null) {
          throw new Error(`Staged value disappeared before commit: ${key}`);
        }
        mutations.push({ type: "set", key, value });
        mutations.push({ type: "remove", key: this.stageKey(key) });
      }
      await this.options.storage.applyMutations!(mutations);
      for (const key of batch) {
        this.promotedKeys.add(key);
        this.stagedKeys.delete(key);
      }
    }
  }
}

export function listAbandonedImportStageIds(storage: KeyValueStoragePort): string[] {
  return (storage.listKeys?.() ?? [])
    .filter((key) => key.startsWith(STAGE_PREFIX) && key.endsWith(".manifest"))
    .map((key) => key.slice(STAGE_PREFIX.length, -".manifest".length))
    .sort();
}

export async function cleanupAbandonedImportStage(
  storage: KeyValueStoragePort,
  id: string,
): Promise<number> {
  validateSegment(id, "id");
  const prefix = `${STAGE_PREFIX}${id}.`;
  const keys = (storage.listKeys?.() ?? []).filter((key) => key.startsWith(prefix));
  for (const key of keys) storage.removeItem(key);
  await storage.flush?.();
  return keys.length;
}
