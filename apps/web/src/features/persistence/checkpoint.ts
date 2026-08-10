import type { OperationJournalEntry } from "./operationJournal";

export const CHECKPOINT_FORMAT_VERSION = 1 as const;
export const CHECKPOINT_INTEGRITY_ALGORITHM = "fnv1a-64" as const;

export interface PersistenceCheckpointMetadata {
  readonly formatVersion: typeof CHECKPOINT_FORMAT_VERSION;
  readonly checkpointId: string;
  readonly deviceId: string;
  readonly createdAt: string;
  readonly throughSequence: number;
  readonly schemaVersion: number;
  readonly entryCount: number;
  readonly byteLength: number;
  readonly integrityAlgorithm: typeof CHECKPOINT_INTEGRITY_ALGORITHM;
  readonly integrityHash: string;
  /** Remote operation cursor fully represented by this checkpoint. */
  readonly replicatedThroughCursor?: number;
}

export interface PersistenceCheckpoint extends PersistenceCheckpointMetadata {
  readonly entries: Readonly<Record<string, string>>;
}

export interface CheckpointRestoreResult {
  readonly restoredCheckpointId: string;
  readonly appliedOperationCount: number;
  readonly entryCount: number;
}

export interface CheckpointPort {
  createCheckpoint(scope?: string): Promise<PersistenceCheckpoint>;
  getLatestCheckpoint(scope?: string): Promise<PersistenceCheckpoint | null>;
  listCheckpoints(limit?: number): Promise<PersistenceCheckpointMetadata[]>;
  restoreCheckpoint(
    checkpoint: PersistenceCheckpoint,
    laterOperations?: readonly OperationJournalEntry[],
    scope?: string,
  ): Promise<CheckpointRestoreResult>;
  calculateStateIntegrityHash(scope?: string): Promise<string>;
}

export function budgetPersistenceKeyPrefix(budgetId: string): string {
  const normalised = budgetId.trim();
  if (!normalised) throw new Error("Checkpoint scopes require a budget ID.");
  return `budget-app.budgets.${normalised}.`;
}

export function filterCheckpointEntriesForScope(
  entries: Readonly<Record<string, string>>,
  scope?: string,
): Record<string, string> {
  if (!scope) return { ...entries };
  const prefix = budgetPersistenceKeyPrefix(scope);
  const ynab4ImportRecordKey = `budget-app.ynab4-launcher-import.v1.${scope}`;
  return Object.fromEntries(
    Object.entries(entries).filter(
      ([key]) => key.startsWith(prefix) || key === ynab4ImportRecordKey,
    ),
  );
}

export function assertCheckpointIsInScope(
  checkpoint: PersistenceCheckpoint,
  scope: string,
): void {
  const prefix = budgetPersistenceKeyPrefix(scope);
  const ynab4ImportRecordKey = `budget-app.ynab4-launcher-import.v1.${scope}`;
  const invalidKey = Object.keys(checkpoint.entries).find(
    (key) => !key.startsWith(prefix) && key !== ynab4ImportRecordKey,
  );
  if (invalidKey) {
    throw new Error(`Checkpoint ${checkpoint.checkpointId} contains data outside budget ${scope}.`);
  }
}

export function createPersistenceCheckpoint(input: {
  readonly checkpointId?: string;
  readonly deviceId: string;
  readonly throughSequence: number;
  readonly schemaVersion: number;
  readonly entries: Readonly<Record<string, string>>;
  readonly createdAt?: Date;
  readonly replicatedThroughCursor?: number;
}): PersistenceCheckpoint {
  if (!input.deviceId.trim()) throw new Error("Checkpoints require a device ID.");
  if (!Number.isSafeInteger(input.throughSequence) || input.throughSequence < 0) {
    throw new Error("Checkpoint journal boundaries must be non-negative integers.");
  }
  const replicatedThroughCursor = input.replicatedThroughCursor ?? 0;
  if (!Number.isSafeInteger(replicatedThroughCursor) || replicatedThroughCursor < 0) {
    throw new Error("Checkpoint remote cursor boundaries must be non-negative integers.");
  }

  const entries = sortEntries(input.entries);
  const serialized = serializeCheckpointEntries(entries);

  return {
    formatVersion: CHECKPOINT_FORMAT_VERSION,
    checkpointId: input.checkpointId ?? createCheckpointId(),
    deviceId: input.deviceId,
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    throughSequence: input.throughSequence,
    schemaVersion: input.schemaVersion,
    entryCount: Object.keys(entries).length,
    byteLength: new TextEncoder().encode(serialized).byteLength,
    integrityAlgorithm: CHECKPOINT_INTEGRITY_ALGORITHM,
    integrityHash: calculateCheckpointIntegrityHash(entries),
    replicatedThroughCursor,
    entries,
  };
}

export function assertCompatibleCheckpoint(
  checkpoint: PersistenceCheckpoint,
  supportedSchemaVersion: number,
): void {
  if (checkpoint.formatVersion !== CHECKPOINT_FORMAT_VERSION) {
    throw new Error(`Unsupported checkpoint format ${checkpoint.formatVersion}.`);
  }
  if (checkpoint.schemaVersion > supportedSchemaVersion) {
    throw new Error(
      `Checkpoint schema ${checkpoint.schemaVersion} is newer than supported schema ${supportedSchemaVersion}.`,
    );
  }
  if (checkpoint.replicatedThroughCursor !== undefined && (!Number.isSafeInteger(checkpoint.replicatedThroughCursor) || checkpoint.replicatedThroughCursor < 0)) {
    throw new Error("Checkpoint remote cursor is invalid.");
  }
  if (checkpoint.entryCount !== Object.keys(checkpoint.entries).length) {
    throw new Error("Checkpoint entry count does not match its payload.");
  }
  if (checkpoint.integrityAlgorithm !== CHECKPOINT_INTEGRITY_ALGORITHM) {
    throw new Error(`Unsupported checkpoint integrity algorithm ${checkpoint.integrityAlgorithm}.`);
  }
  if (checkpoint.integrityHash !== calculateCheckpointIntegrityHash(checkpoint.entries)) {
    throw new Error("Checkpoint integrity verification failed.");
  }
}

export function applyOperationsToCheckpointEntries(
  checkpoint: PersistenceCheckpoint,
  operations: readonly OperationJournalEntry[],
): Record<string, string> {
  const entries = { ...checkpoint.entries };
  const seenOperationIds = new Set<string>();

  for (const operation of operations) {
    if (seenOperationIds.has(operation.operationId)) continue;
    seenOperationIds.add(operation.operationId);

    if (operation.mutation.type === "key-value.set") {
      entries[operation.mutation.key] = operation.mutation.value;
    } else {
      delete entries[operation.mutation.key];
    }
  }

  return sortEntries(entries);
}

export function checkpointMetadata(
  checkpoint: PersistenceCheckpoint,
): PersistenceCheckpointMetadata {
  const { entries: _entries, ...metadata } = checkpoint;
  return metadata;
}

export function calculateCheckpointIntegrityHash(
  entries: Readonly<Record<string, string>>,
): string {
  const bytes = new TextEncoder().encode(serializeCheckpointEntries(sortEntries(entries)));
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, "0");
}

function serializeCheckpointEntries(entries: Readonly<Record<string, string>>): string {
  return JSON.stringify(Object.entries(entries));
}

function sortEntries(entries: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(entries).sort(([left], [right]) => left.localeCompare(right)));
}

function createCheckpointId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `checkpoint-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
