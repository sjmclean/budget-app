import assert from "node:assert/strict";
import test from "node:test";

import { BUDGET_REGISTRY_STORAGE_KEY } from "../../apps/web/src/features/budget/budgetRegistry.js";
import {
  SELECTED_BUDGET_STORAGE_KEY,
  getBudgetScopedStorageKey,
} from "../../apps/web/src/features/budget/budgetDataScope.js";
import {
  getYnab4LauncherImportStorageKey,
} from "../../apps/web/src/features/budget/ynab4/finaliseYnab4Import.js";
import {
  captureYnab4LauncherImportRollbackSnapshot,
  rollbackYnab4LauncherImport,
} from "../../apps/web/src/features/budget/ynab4/rollbackYnab4Import.js";
import {
  TRANSACTION_ENTITY_INDEX_KEY,
  TRANSACTION_ENTITY_RECORD_PREFIX,
} from "../../apps/web/src/features/accounts/entities/transactionEntity.js";
import {
  YNAB4_ACCOUNTS_STORAGE_KEY,
  YNAB4_BUDGET_VIEW_STORAGE_PREFIX,
  YNAB4_PAYEES_STORAGE_KEY,
} from "../../apps/web/src/features/budget/ynab4/importStorageKeys.js";
import type { KeyValueStoragePort } from "../../apps/web/src/features/persistence/keyValueStoragePort.js";

function createMemoryStorage(
  entries: Array<[string, string]>,
): KeyValueStoragePort & { values: Map<string, string> } {
  const values = new Map(entries);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    listKeys: () => [...values.keys()],
  };
}

test("captures the pre-import registry, selection, and key set", () => {
  const storage = createMemoryStorage([
    [BUDGET_REGISTRY_STORAGE_KEY, "registry-before"],
    [SELECTED_BUDGET_STORAGE_KEY, "budget-before"],
    ["existing-key", "existing-value"],
  ]);

  const snapshot = captureYnab4LauncherImportRollbackSnapshot(
    storage,
    "budget-imported",
  );

  assert.equal(snapshot.budgetId, "budget-imported");
  assert.equal(snapshot.registryBeforeImport, "registry-before");
  assert.equal(snapshot.selectedBudgetBeforeImport, "budget-before");
  assert.deepEqual(
    [...snapshot.keysBeforeImport].sort(),
    [BUDGET_REGISTRY_STORAGE_KEY, SELECTED_BUDGET_STORAGE_KEY, "existing-key"].sort(),
  );
});

test("restores pre-import state and removes all partial budget data", () => {
  const budgetId = "budget-imported";
  const storage = createMemoryStorage([
    [BUDGET_REGISTRY_STORAGE_KEY, "registry-before"],
    [SELECTED_BUDGET_STORAGE_KEY, "budget-before"],
    ["existing-key", "existing-value"],
  ]);
  const snapshot = captureYnab4LauncherImportRollbackSnapshot(storage, budgetId);

  storage.setItem(BUDGET_REGISTRY_STORAGE_KEY, "registry-after");
  storage.setItem(SELECTED_BUDGET_STORAGE_KEY, budgetId);
  storage.setItem("new-unscoped-key", "partial");
  storage.setItem(getYnab4LauncherImportStorageKey(budgetId), "record");
  storage.setItem(getBudgetScopedStorageKey(budgetId, YNAB4_ACCOUNTS_STORAGE_KEY), "accounts");
  storage.setItem(getBudgetScopedStorageKey(budgetId, TRANSACTION_ENTITY_INDEX_KEY), JSON.stringify(["transaction"]));
  storage.setItem(getBudgetScopedStorageKey(budgetId, `${TRANSACTION_ENTITY_RECORD_PREFIX}transaction`), "transaction-entity");
  storage.setItem(getBudgetScopedStorageKey(budgetId, YNAB4_PAYEES_STORAGE_KEY), "payees");
  storage.setItem(getBudgetScopedStorageKey(budgetId, "budget-app.entity-replication.v1/scheduled-transaction-index"), JSON.stringify(["scheduled"]));
  storage.setItem(getBudgetScopedStorageKey(budgetId, "budget-app.entity-replication.v1/scheduled-transaction/scheduled"), "scheduled-entity");
  storage.setItem(`${YNAB4_BUDGET_VIEW_STORAGE_PREFIX}.${budgetId}.2026-07`, "month");

  rollbackYnab4LauncherImport(storage, snapshot);

  assert.equal(storage.getItem(BUDGET_REGISTRY_STORAGE_KEY), "registry-before");
  assert.equal(storage.getItem(SELECTED_BUDGET_STORAGE_KEY), "budget-before");
  assert.equal(storage.getItem("existing-key"), "existing-value");
  assert.equal(storage.getItem("new-unscoped-key"), null);
  assert.equal(storage.getItem(getYnab4LauncherImportStorageKey(budgetId)), null);
  assert.equal(
    storage.getItem(getBudgetScopedStorageKey(budgetId, YNAB4_ACCOUNTS_STORAGE_KEY)),
    null,
  );
  assert.equal(storage.getItem(getBudgetScopedStorageKey(budgetId, TRANSACTION_ENTITY_INDEX_KEY)), null);
  assert.equal(storage.getItem(getBudgetScopedStorageKey(budgetId, `${TRANSACTION_ENTITY_RECORD_PREFIX}transaction`)), null);
  assert.equal(storage.getItem(getBudgetScopedStorageKey(budgetId, "budget-app.entity-replication.v1/scheduled-transaction-index")), null);
  assert.equal(storage.getItem(getBudgetScopedStorageKey(budgetId, "budget-app.entity-replication.v1/scheduled-transaction/scheduled")), null);
  assert.equal(
    storage.getItem(`${YNAB4_BUDGET_VIEW_STORAGE_PREFIX}.${budgetId}.2026-07`),
    null,
  );
});

test("removes registry and selection when they did not exist before import", () => {
  const storage = createMemoryStorage([]);
  const snapshot = captureYnab4LauncherImportRollbackSnapshot(storage);

  storage.setItem(BUDGET_REGISTRY_STORAGE_KEY, "created-registry");
  storage.setItem(SELECTED_BUDGET_STORAGE_KEY, "created-budget");

  rollbackYnab4LauncherImport(storage, snapshot);

  assert.equal(storage.getItem(BUDGET_REGISTRY_STORAGE_KEY), null);
  assert.equal(storage.getItem(SELECTED_BUDGET_STORAGE_KEY), null);
});
