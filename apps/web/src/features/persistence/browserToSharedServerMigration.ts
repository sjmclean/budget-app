import { browserLocalStoragePersistenceGateway } from "./browserLocalStoragePersistenceGateway";
import type { BudgetPersistenceSnapshot } from "./persistenceSnapshot";
import {
  createSharedServerStorageClient,
  type SharedServerStorageClient,
  type SharedServerStorageOperation,
} from "./sharedServerStorageClient";

const DEFAULT_MAX_BATCH_BYTES = 4 * 1024 * 1024;
const MAX_SINGLE_ENTRY_BYTES = 45 * 1024 * 1024;

export interface BrowserToSharedServerMigrationInspection {
  browserEntries: Readonly<Record<string, string>>;
  browserKeyCount: number;
  browserByteLength: number;
  serverKeyCount: number;
  serverRevision: number;
  canMigrate: boolean;
  message: string;
}

export interface BrowserToSharedServerMigrationResult {
  importedKeys: number;
  revision: number;
}

export interface BrowserToSharedServerMigrationOptions {
  client?: SharedServerStorageClient;
  apiBaseUrl?: string;
  exportSnapshot?: () => BudgetPersistenceSnapshot | Promise<BudgetPersistenceSnapshot>;
  maxBatchBytes?: number;
}

export async function inspectBrowserToSharedServerMigration(
  options: BrowserToSharedServerMigrationOptions = {},
): Promise<BrowserToSharedServerMigrationInspection> {
  const client =
    options.client ??
    createSharedServerStorageClient({
      baseUrl: options.apiBaseUrl ?? readConfiguredApiBaseUrl(),
    });
  const browserSnapshot = await collectBrowserBudgetSnapshot(options);
  const serverSnapshot = await client.loadSnapshot();
  const browserKeyCount = browserSnapshot.entryCount;
  const serverKeyCount = Object.keys(serverSnapshot.entries).length;

  if (serverKeyCount > 0) {
    return {
      browserEntries: browserSnapshot.entries,
      browserKeyCount,
      browserByteLength: browserSnapshot.byteLength,
      serverKeyCount,
      serverRevision: serverSnapshot.revision,
      canMigrate: false,
      message:
        "The shared server already contains budget data. Migration is disabled to prevent overwriting it.",
    };
  }

  if (browserKeyCount === 0) {
    return {
      browserEntries: browserSnapshot.entries,
      browserKeyCount,
      browserByteLength: browserSnapshot.byteLength,
      serverKeyCount,
      serverRevision: serverSnapshot.revision,
      canMigrate: false,
      message: "No browser budget data was found on this device.",
    };
  }

  return {
    browserEntries: browserSnapshot.entries,
    browserKeyCount,
    browserByteLength: browserSnapshot.byteLength,
    serverKeyCount,
    serverRevision: serverSnapshot.revision,
    canMigrate: true,
    message: `${browserKeyCount} canonical browser budget records are ready to move to the shared server.`,
  };
}

export async function migrateBrowserBudgetToSharedServer(
  options: BrowserToSharedServerMigrationOptions = {},
): Promise<BrowserToSharedServerMigrationResult> {
  const client =
    options.client ??
    createSharedServerStorageClient({
      baseUrl: options.apiBaseUrl ?? readConfiguredApiBaseUrl(),
    });
  const inspection = await inspectBrowserToSharedServerMigration({
    ...options,
    client,
  });

  if (!inspection.canMigrate) {
    throw new Error(inspection.message);
  }

  const batches = partitionEntries(
    inspection.browserEntries,
    options.maxBatchBytes ?? DEFAULT_MAX_BATCH_BYTES,
  );
  const [firstBatch, ...remainingBatches] = batches;

  if (!firstBatch) {
    throw new Error("No browser budget data was available to migrate.");
  }

  const bootstrapResult = await client.bootstrap(firstBatch);
  let revision = bootstrapResult.revision;

  for (const batch of remainingBatches) {
    const operations: SharedServerStorageOperation[] = Object.entries(batch).map(
      ([key, value]) => ({ type: "set", key, value }),
    );
    revision = (await client.applyOperations(operations, revision)).revision;
  }

  return {
    importedKeys: inspection.browserKeyCount,
    revision,
  };
}

export async function collectBrowserBudgetSnapshot(
  options: Pick<BrowserToSharedServerMigrationOptions, "exportSnapshot"> = {},
): Promise<BudgetPersistenceSnapshot> {
  const exportSnapshot =
    options.exportSnapshot ?? browserLocalStoragePersistenceGateway.exportSnapshot;

  if (!exportSnapshot) {
    throw new Error("The browser persistence provider cannot export a budget snapshot.");
  }

  return exportSnapshot();
}

export async function collectBrowserBudgetEntries(): Promise<Record<string, string>> {
  const snapshot = await collectBrowserBudgetSnapshot();
  return { ...snapshot.entries };
}

export function partitionEntries(
  entries: Readonly<Record<string, string>>,
  maxBatchBytes = DEFAULT_MAX_BATCH_BYTES,
): Array<Record<string, string>> {
  if (!Number.isFinite(maxBatchBytes) || maxBatchBytes <= 0) {
    throw new Error("Migration batch size must be greater than zero.");
  }

  const batches: Array<Record<string, string>> = [];
  let current: Record<string, string> = {};
  let currentBytes = 0;

  for (const [key, value] of Object.entries(entries)) {
    const entryBytes = estimateEntryJsonBytes(key, value);

    if (entryBytes > MAX_SINGLE_ENTRY_BYTES) {
      throw new Error(
        `Budget record ${key} exceeds the maximum supported migration size (${entryBytes} bytes).`,
      );
    }

    if (entryBytes > maxBatchBytes) {
      if (currentBytes > 0) {
        batches.push(current);
        current = {};
        currentBytes = 0;
      }

      batches.push({
        [key]: value,
      });

      continue;
    }

    if (currentBytes > 0 && currentBytes + entryBytes > maxBatchBytes) {
      batches.push(current);
      current = {};
      currentBytes = 0;
    }

    current[key] = value;
    currentBytes += entryBytes;
  }

  if (currentBytes > 0) {
    batches.push(current);
  }

  return batches;
}

function estimateEntryJsonBytes(key: string, value: string): number {
  return new TextEncoder().encode(JSON.stringify({ [key]: value })).byteLength;
}

function readConfiguredApiBaseUrl(): string {
  const environment = (
    import.meta as ImportMeta & {
      readonly env?: { readonly VITE_BUDGET_API_URL?: string };
    }
  ).env;

  return environment?.VITE_BUDGET_API_URL?.trim() ?? "";
}
