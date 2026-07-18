import { readBudgetRegistry } from "./budgetRegistry";
import { resolveActiveBudgetId } from "./activeBudget";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";

export const SELECTED_BUDGET_STORAGE_KEY = "budget-app.selected-budget-id.v1";

const BUDGET_SCOPED_EXACT_KEYS = new Set([
  "budget-app.accounts.v1",
  "budget-app.account-registers.v1",
  "budget-app.payees.v1",
  "budget-app.scheduled-transactions.v1",
  "budget-app.transaction-tags.v1",
  "budget-app.account-import-knowledge.v1",
  "budget-app.imported-file-fingerprints.v1",
  "budget-app.imported-transaction-fingerprints.v1",
  "budget-app.merchant-knowledge.v1",
]);

const BUDGET_SCOPED_KEY_PREFIXES = [
  "budget-app.register.",
  "budget-app.transaction-import-session.v1.",
];

export function isBudgetScopedStorageKey(key: string): boolean {
  return BUDGET_SCOPED_EXACT_KEYS.has(key) || BUDGET_SCOPED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function getBudgetScopedStorageKey(budgetId: string, key: string): string {
  return `budget-app.budgets.${budgetId}.${key}`;
}

export function getActiveBudgetIdFromStorage(storage: KeyValueStoragePort): string | null {
  const budgets = readBudgetRegistry(storage);
  const selectedBudgetId = storage.getItem(SELECTED_BUDGET_STORAGE_KEY)?.trim() || null;
  return resolveActiveBudgetId(budgets, selectedBudgetId);
}

export function createBudgetScopedStorage(storage: KeyValueStoragePort): KeyValueStoragePort {
  function resolveKey(key: string): string {
    if (!isBudgetScopedStorageKey(key)) {
      return key;
    }

    const activeBudgetId = getActiveBudgetIdFromStorage(storage);
    return activeBudgetId ? getBudgetScopedStorageKey(activeBudgetId, key) : key;
  }

  return {
    getItem(key: string): string | null {
      if (!isBudgetScopedStorageKey(key)) {
        return storage.getItem(key);
      }

      const scopedKey = resolveKey(key);
      const scopedValue = storage.getItem(scopedKey);

      if (scopedValue !== null) {
        return scopedValue;
      }

      // Legacy migration bridge: pre-v1.48 browser data lived under global keys.
      // Keep the default starter budget readable until the next write migrates it
      // into the active budget namespace.
      if (getActiveBudgetIdFromStorage(storage) === "household") {
        return storage.getItem(key);
      }

      return null;
    },

    setItem(key: string, value: string): void {
      storage.setItem(resolveKey(key), value);
    },

    removeItem(key: string): void {
      storage.removeItem(resolveKey(key));

      if (isBudgetScopedStorageKey(key) && getActiveBudgetIdFromStorage(storage) === "household") {
        storage.removeItem(key);
      }
    },

    listKeys(): string[] {
      return typeof storage.listKeys === "function" ? storage.listKeys() : [];
    },
  };
}
