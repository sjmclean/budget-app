const FIRST_ARGUMENT_BUDGET_METHODS = new Set([
  "exportBudget",
  "listRestorePoints",
  "createRestorePoint",
  "restoreRestorePoint",
  "restoreBudget",
  "resetBudget",
  "publishLocalBaseline",
  "listSyncConflicts",
  "resolveSyncConflict",
  "listAccounts",
  "listAccountNavigation",
  "getFinancialOverview",
  "getMonthlySpending",
  "getMonthlyCategoryTransactions",
  "createAccount",
  "captureAccount",
  "updateAccount",
  "deleteAccount",
  "listPayees",
  "listPayeeDuplicateSuppressions",
  "keepPayeesSeparate",
  "createPayee",
  "capturePayee",
  "updatePayee",
  "setPayeeArchived",
  "deleteUnusedPayee",
  "mergePayees",
  "listTransactionTags",
  "replaceTransactionTags",
  "listScheduledTransactions",
  "captureScheduledTransaction",
  "createScheduledTransaction",
  "updateScheduledTransaction",
  "deleteScheduledTransaction",
  "advanceScheduledTransaction",
  "renameScheduledPayeeReferences",
  "reassignScheduledPayeeReferences",
  "mutateCategory",
]);

const FIRST_ARGUMENT_OBJECT_BUDGET_METHODS = new Set([
  "getCategoryGoal",
  "listCategoryGoals",
  "createCategoryGoal",
  "updateCategoryGoal",
  "deleteCategoryGoal",
  "replaceCategoryGoalHistoryState",
  "getImportedTransactionSourceOccurrences",
  "getAccountRegisterBootstrap",
  "getAccountSummary",
  "queryTransactions",
  "getTransactionsByIds",
  "setAccountClosed",
  "getBudgetMonthView",
  "setCategoryAssignedValues",
  "getBudgetCategoryOptions",
  "getCategoryActivityDrilldown",
  "addTransaction",
  "commitTransactionBatch",
  "commitImportBatch",
  "commitImportBatchWithHistory",
  "moveTransactions",
  "setTransactionsCleared",
  "captureTransactionHistorySnapshots",
  "restoreTransactionHistorySnapshot",
  "deleteTransactionHistorySnapshot",
  "addTransactionAttachment",
  "removeTransactionAttachment",
  "readTransactionAttachment",
  "replaceAccountHistoryState",
  "replaceBudgetMonthHistoryState",
  "replacePayeeDuplicateSuppressionsHistoryState",
  "replacePayeeHistoryState",
  "replaceTransactionTagsHistoryState",
  "replaceScheduledTransactionHistoryState",
  "enterScheduledTransaction",
  "getCategoryMergePreview",
]);

const SECOND_ARGUMENT_OBJECT_BUDGET_METHODS = new Set([
  "updateTransaction",
  "toggleTransactionCleared",
  "deleteTransaction",
]);

const NESTED_HISTORY_BUDGET_METHODS = new Set([
  "replaceImportHistorySnapshot",
  "replaceTransactionHistorySnapshot",
]);

function routingError(method: PropertyKey, detail: string): Error {
  return Object.assign(
    new Error(`Budget ownership routing for ${String(method)} ${detail}`),
    { code: "BUDGET_OWNERSHIP_ROUTE_INVALID" },
  );
}

function readBudgetId(
  method: PropertyKey,
  value: unknown,
  location: string,
): string {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as { budgetId?: unknown }).budgetId !== "string" ||
    !(value as { budgetId: string }).budgetId.trim()
  ) {
    throw routingError(method, `requires ${location}.budgetId.`);
  }

  return (value as { budgetId: string }).budgetId;
}

/**
 * Resolves the authoritative budget identity for every ordinary method exposed
 * through the local-first ownership proxy.
 *
 * This is intentionally contract-aware. Entity IDs, account IDs and schedule
 * IDs are also strings, so inferring ownership from runtime argument type is
 * unsafe. Unknown method shapes fail closed.
 */
export function resolveOwnedBudgetId(
  method: PropertyKey,
  args: readonly unknown[],
): string {
  if (typeof method !== "string") {
    throw routingError(method, "uses an unsupported property key.");
  }

  if (FIRST_ARGUMENT_BUDGET_METHODS.has(method)) {
    const budgetId = args[0];
    if (typeof budgetId !== "string" || !budgetId.trim()) {
      throw routingError(method, "requires a budget id as its first argument.");
    }
    return budgetId;
  }

  if (FIRST_ARGUMENT_OBJECT_BUDGET_METHODS.has(method)) {
    return readBudgetId(method, args[0], "its first argument");
  }

  if (SECOND_ARGUMENT_OBJECT_BUDGET_METHODS.has(method)) {
    return readBudgetId(method, args[1], "its second argument");
  }

  if (NESTED_HISTORY_BUDGET_METHODS.has(method)) {
    const input = args[0] as {
      expected?: unknown;
      replacement?: unknown;
    } | null | undefined;

    if (!input || typeof input !== "object") {
      throw routingError(method, "requires a history replacement object.");
    }

    const expectedBudgetId = readBudgetId(
      method,
      input.expected,
      "its expected snapshot",
    );
    const replacementBudgetId = readBudgetId(
      method,
      input.replacement,
      "its replacement snapshot",
    );

    if (expectedBudgetId !== replacementBudgetId) {
      throw routingError(
        method,
        "cannot route history snapshots from different budgets.",
      );
    }

    return expectedBudgetId;
  }

  throw Object.assign(
    new Error(
      `Budget ownership routing is not configured for ${method}. ` +
      "Add an explicit method contract before exposing it through the ownership proxy.",
    ),
    { code: "BUDGET_OWNERSHIP_ROUTE_UNCLASSIFIED" },
  );
}

export const OWNED_BUDGET_ROUTING_METHODS = Object.freeze({
  firstArgumentBudget: [...FIRST_ARGUMENT_BUDGET_METHODS],
  firstArgumentObjectBudget: [...FIRST_ARGUMENT_OBJECT_BUDGET_METHODS],
  secondArgumentObjectBudget: [...SECOND_ARGUMENT_OBJECT_BUDGET_METHODS],
  nestedHistoryBudget: [...NESTED_HISTORY_BUDGET_METHODS],
});
