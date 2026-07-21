import {
  BUDGET_REGISTRY_STORAGE_KEY,
} from "../budgetRegistry";
import {
  SELECTED_BUDGET_STORAGE_KEY,
  getBudgetScopedStorageKey,
} from "../budgetDataScope";
import type { KeyValueStoragePort } from "../../persistence/keyValueStoragePort";
import { getYnab4LauncherImportStorageKey } from "./finaliseYnab4Import";
import {
  YNAB4_ACCOUNTS_STORAGE_KEY,
  YNAB4_BUDGET_VIEW_STORAGE_PREFIX,
  YNAB4_PAYEES_STORAGE_KEY,
  YNAB4_REGISTERS_STORAGE_KEY,
  YNAB4_SCHEDULED_STORAGE_KEY,
} from "./importStorageKeys";

export interface Ynab4LauncherImportRollbackSnapshot {
  budgetId: string | null;
  keysBeforeImport: Set<string>;
  registryBeforeImport: string | null;
  selectedBudgetBeforeImport: string | null;
}

export function captureYnab4LauncherImportRollbackSnapshot(
  storage: KeyValueStoragePort,
  budgetId: string | null = null,
): Ynab4LauncherImportRollbackSnapshot {
  return {
    budgetId,
    keysBeforeImport: new Set(storage.listKeys?.() ?? []),
    registryBeforeImport: storage.getItem(BUDGET_REGISTRY_STORAGE_KEY),
    selectedBudgetBeforeImport: storage.getItem(SELECTED_BUDGET_STORAGE_KEY),
  };
}

export function rollbackYnab4LauncherImport(
  storage: KeyValueStoragePort,
  snapshot: Ynab4LauncherImportRollbackSnapshot,
): void {
  removeKeysCreatedAfterSnapshot(storage, snapshot.keysBeforeImport);

  if (snapshot.budgetId) {
    removeBudgetImportData(storage, snapshot.budgetId);
  }

  restoreStorageValue(
    storage,
    BUDGET_REGISTRY_STORAGE_KEY,
    snapshot.registryBeforeImport,
  );
  restoreStorageValue(
    storage,
    SELECTED_BUDGET_STORAGE_KEY,
    snapshot.selectedBudgetBeforeImport,
  );
}

function removeKeysCreatedAfterSnapshot(
  storage: KeyValueStoragePort,
  keysBeforeImport: Set<string>,
): void {
  for (const key of storage.listKeys?.() ?? []) {
    if (!keysBeforeImport.has(key)) {
      storage.removeItem(key);
    }
  }
}

function removeBudgetImportData(
  storage: KeyValueStoragePort,
  budgetId: string,
): void {
  storage.removeItem(getYnab4LauncherImportStorageKey(budgetId));
  storage.removeItem(
    getBudgetScopedStorageKey(budgetId, YNAB4_ACCOUNTS_STORAGE_KEY),
  );
  storage.removeItem(
    getBudgetScopedStorageKey(budgetId, YNAB4_REGISTERS_STORAGE_KEY),
  );
  storage.removeItem(
    getBudgetScopedStorageKey(budgetId, YNAB4_PAYEES_STORAGE_KEY),
  );
  storage.removeItem(
    getBudgetScopedStorageKey(budgetId, YNAB4_SCHEDULED_STORAGE_KEY),
  );

  for (const key of storage.listKeys?.() ?? []) {
    if (key.startsWith(`${YNAB4_BUDGET_VIEW_STORAGE_PREFIX}.${budgetId}.`)) {
      storage.removeItem(key);
    }
  }
}

function restoreStorageValue(
  storage: KeyValueStoragePort,
  key: string,
  value: string | null,
): void {
  if (value === null) {
    storage.removeItem(key);
    return;
  }

  storage.setItem(key, value);
}
