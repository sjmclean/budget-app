import { isBudgetScopedStorageKey, SELECTED_BUDGET_STORAGE_KEY } from "../budget/budgetDataScope";
import { BUDGET_REGISTRY_STORAGE_KEY } from "../budget/budgetRegistry";
import type { OperationJournalEntry } from "./operationJournal";

const BUDGET_NAMESPACE_PREFIX = "budget-app.budgets.";
const BUDGET_VIEW_PREFIX = "budget-app.budget-view.v1.";
const REPLICATED_ENTITY_PREFIX = "budget-app.entity-replication.v1/";

export type PersistenceKeyClassification = "canonical" | "local-only";

/**
 * Classifies persisted records at the temporary document-replication boundary.
 *
 * Unknown keys are deliberately local-only. Canonical replication must be
 * explicitly opted into so new preferences, diagnostics and caches cannot
 * silently enter the operation journal or remote checkpoints.
 */
export function classifyPersistenceKey(key: string): PersistenceKeyClassification {
  if (key === SELECTED_BUDGET_STORAGE_KEY) {
    return "local-only";
  }

  if (
    key === BUDGET_REGISTRY_STORAGE_KEY ||
    key.startsWith(BUDGET_VIEW_PREFIX) ||
    key.startsWith(REPLICATED_ENTITY_PREFIX) ||
    isBudgetScopedStorageKey(key)
  ) {
    return "canonical";
  }

  if (!key.startsWith(BUDGET_NAMESPACE_PREFIX)) {
    return "local-only";
  }

  const logicalKeyStart = key.indexOf("budget-app.", BUDGET_NAMESPACE_PREFIX.length);
  if (logicalKeyStart < 0) {
    return "local-only";
  }

  return isBudgetScopedStorageKey(key.slice(logicalKeyStart))
    ? "canonical"
    : "local-only";
}

export function isCanonicalPersistenceKey(key: string): boolean {
  return classifyPersistenceKey(key) === "canonical";
}

export function filterCanonicalPersistenceEntries(
  entries: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(entries).filter(([key]) => isCanonicalPersistenceKey(key)),
  );
}

export function filterCanonicalOperationJournalEntries(
  operations: readonly OperationJournalEntry[],
): OperationJournalEntry[] {
  return operations.filter((operation) =>
    isCanonicalPersistenceKey(operation.mutation.key),
  );
}

export function mergeRestoredCanonicalPersistenceEntries(
  currentEntries: Readonly<Record<string, string>>,
  restoredCanonicalEntries: Readonly<Record<string, string>>,
): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.entries(currentEntries).filter(([key]) => !isCanonicalPersistenceKey(key)),
    ),
    ...filterCanonicalPersistenceEntries(restoredCanonicalEntries),
  };
}
