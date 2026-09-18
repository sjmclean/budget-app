import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import {
  BUDGET_REGISTRY_STORAGE_KEY,
  createBudgetRegistryEntry,
  readBudgetRegistry,
  updateBudgetRegistryEntry,
  type BudgetSummary,
} from "./budgetRegistry";
import { LocalBudgetDatabaseClient } from "../persistence/localFirst/localBudgetClient";
import { provisionFreshLocalFirstBudget } from "../persistence/localFirst/freshBudgetProvisioning";
import { publishLocalBaseline } from "../persistence/localFirst/baselineCoordinator";
import { getOrCreateLocalFirstDeviceId } from "../persistence/localFirst/localFirstDeviceId";

export interface SqliteBackupLauncherImportResult {
  readonly budget: BudgetSummary;
  readonly budgets: BudgetSummary[];
}

function restoredBudgetName(fileName: string): string {
  const base = fileName
    .replace(/\.(?:budget-sqlite|sqlite3?|db)$/i, "")
    .replace(/[-_](?:backup|export)(?:[-_]\d{4}-\d{2}-\d{2})?$/i, "")
    .trim();
  return base || "Restored Budget";
}

function createPendingRegistryEntry(
  storage: KeyValueStoragePort,
  file: File,
  now: Date,
): {
  readonly budget: BudgetSummary;
  readonly values: Map<string, string>;
} {
  const values = new Map<string, string>();
  const current = storage.getItem(BUDGET_REGISTRY_STORAGE_KEY);
  if (current !== null) values.set(BUDGET_REGISTRY_STORAGE_KEY, current);
  const capture: KeyValueStoragePort = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    listKeys: () => [...values.keys()],
  };
  const budget = createBudgetRegistryEntry(capture, {
    name: restoredBudgetName(file.name),
    currency: "AUD",
    packagePath: `~/Budgets/${file.name}`,
    persistenceSource: "local-first-hosted",
    now,
  });
  return { budget, values };
}

export async function createBudgetFromSqliteBackup(
  storage: KeyValueStoragePort,
  file: File,
  now = new Date(),
): Promise<SqliteBackupLauncherImportResult> {
  if (!(file instanceof Blob) || file.size < 1) {
    throw new Error("Choose a non-empty Budget App SQLite backup.");
  }

  const pending = createPendingRegistryEntry(storage, file, now);
  let budget = pending.budget;
  let provisioned:
    | Awaited<ReturnType<typeof provisionFreshLocalFirstBudget>>
    | null = null;
  let database: LocalBudgetDatabaseClient | null = null;
  let replacementStarted = false;
  let clonePublished = false;

  try {
    provisioned = await provisionFreshLocalFirstBudget(budget.id);
    database = new LocalBudgetDatabaseClient(undefined, storage);

    await database.beginBaselineReplacement({
      budgetId: budget.id,
      syncEpoch: provisioned.syncEpoch,
      deviceId: getOrCreateLocalFirstDeviceId(storage),
      totalBytes: file.size,
    });
    replacementStarted = true;

    for (let offset = 0; offset < file.size; offset += 4 * 1024 * 1024) {
      const bytes = new Uint8Array(
        await file.slice(offset, offset + 4 * 1024 * 1024).arrayBuffer(),
      );
      await database.appendBaselineReplacement(offset, bytes);
    }

    await database.commitBaselineClone();
    replacementStarted = false;
    clonePublished = true;

    const accounts = await database.listAccountNavigation(budget.id);
    const currency = accounts[0]?.currencyCode?.trim().toUpperCase() || "AUD";
    const capture: KeyValueStoragePort = {
      getItem: (key) => pending.values.get(key) ?? null,
      setItem: (key, value) => { pending.values.set(key, value); },
      removeItem: (key) => { pending.values.delete(key); },
      listKeys: () => [...pending.values.keys()],
    };
    budget = updateBudgetRegistryEntry(capture, budget.id, {
      currency,
      now,
    }) ?? budget;

    await publishLocalBaseline({
      budgetId: budget.id,
      budgetName: budget.name,
      currency: budget.currency,
      syncEpoch: provisioned.syncEpoch,
      database,
      relay: provisioned.relay,
    });

    await database.captureRestorePoint({
      budgetName: budget.name,
      reason: "initial-import",
      mutationCount: 0,
    });

    await database.close();
    database = null;

    const serialized = pending.values.get(BUDGET_REGISTRY_STORAGE_KEY);
    if (!serialized) {
      throw new Error("The restored budget registry entry could not be published.");
    }
    storage.setItem(BUDGET_REGISTRY_STORAGE_KEY, serialized);
    await storage.flush?.();

    const published =
      readBudgetRegistry(storage).find(({ id }) => id === budget.id) ?? budget;
    return {
      budget: published,
      budgets: readBudgetRegistry(storage),
    };
  } catch (error) {
    if (database) {
      if (replacementStarted) {
        await database.abortBaselineReplacement().catch(() => undefined);
      }
      if (clonePublished) {
        await database.deleteBudgetFile().catch(() => undefined);
      }
      await database.close().catch(() => undefined);
    }
    if (provisioned) {
      await provisioned.relay.deleteBudget(budget.id).catch(() => undefined);
    }
    throw error;
  }
}
