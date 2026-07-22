import {
  isBudgetScopedStorageKey,
  SELECTED_BUDGET_STORAGE_KEY,
} from "../budget/budgetDataScope";
import { BUDGET_REGISTRY_STORAGE_KEY } from "../budget/budgetRegistry";
import type { KeyValueStoragePort } from "./keyValueStoragePort";

const BUDGET_NAMESPACE_PREFIX = "budget-app.budgets.";
const BUDGET_VIEW_PREFIX = "budget-app.budget-view.v1.";

export interface BudgetPersistenceSnapshot {
  readonly entries: Readonly<Record<string, string>>;
  readonly entryCount: number;
  readonly byteLength: number;
}

/**
 * Returns true only for records required to reconstruct budgets on another
 * persistence provider. Device preferences, import diagnostics, launcher state,
 * version history and other browser-only records deliberately stay local.
 */
export function isCanonicalBudgetStorageKey(key: string): boolean {
  if (
    key === BUDGET_REGISTRY_STORAGE_KEY ||
    key === SELECTED_BUDGET_STORAGE_KEY ||
    key.startsWith(BUDGET_VIEW_PREFIX) ||
    isBudgetScopedStorageKey(key)
  ) {
    return true;
  }

  if (!key.startsWith(BUDGET_NAMESPACE_PREFIX)) {
    return false;
  }

  const logicalKeyStart = key.indexOf("budget-app.", BUDGET_NAMESPACE_PREFIX.length);
  if (logicalKeyStart < 0) {
    return false;
  }

  return isBudgetScopedStorageKey(key.slice(logicalKeyStart));
}

export function exportBudgetPersistenceSnapshot(
  storage: KeyValueStoragePort,
): BudgetPersistenceSnapshot {
  const entries: Record<string, string> = {};
  let byteLength = 0;

  for (const key of storage.listKeys?.() ?? []) {
    if (!isCanonicalBudgetStorageKey(key)) {
      continue;
    }

    const value = storage.getItem(key);
    if (value === null) {
      continue;
    }

    entries[key] = value;
    byteLength += utf8ByteLength(key) + utf8ByteLength(value);
  }

  return {
    entries,
    entryCount: Object.keys(entries).length,
    byteLength,
  };
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
