import assert from "node:assert/strict";
import test from "node:test";
import {
  OWNED_BUDGET_ROUTING_METHODS,
  resolveOwnedBudgetId,
} from "../../../apps/web/src/features/persistence/localFirst/budgetDatabaseOwnershipRouting";

test("entity-id-first transaction methods resolve ownership from the second argument", () => {
  for (const method of [
    "updateTransaction",
    "toggleTransactionCleared",
    "deleteTransaction",
  ]) {
    assert.equal(
      resolveOwnedBudgetId(method, [
        "transaction-123",
        { budgetId: "budget-A", accountId: "account-1" },
      ]),
      "budget-A",
    );
  }
});

test("ordinary budget-first methods use their explicit first budget argument", () => {
  for (const method of [
    "listAccounts",
    "listPayees",
    "listScheduledTransactions",
    "publishLocalBaseline",
    "listSyncConflicts",
    "resolveSyncConflict",
  ]) {
    assert.equal(
      resolveOwnedBudgetId(method, ["budget-A", "other-id"]),
      "budget-A",
    );
  }
});

test("object-first methods use their declared budgetId property", () => {
  for (const method of [
    "getAccountRegisterBootstrap",
    "queryTransactions",
    "addTransaction",
    "setTransactionsCleared",
    "getBudgetMonthView",
    "replaceScheduledTransactionHistoryState",
  ]) {
    assert.equal(
      resolveOwnedBudgetId(method, [{ budgetId: "budget-A" }]),
      "budget-A",
    );
  }
});

test("history replacement methods resolve the nested snapshot budget", () => {
  for (const method of [
    "replaceTransactionHistorySnapshot",
    "replaceImportHistorySnapshot",
  ]) {
    assert.equal(
      resolveOwnedBudgetId(method, [{
        expected: { budgetId: "budget-A" },
        replacement: { budgetId: "budget-A" },
      }]),
      "budget-A",
    );
  }
});

test("history replacement refuses snapshots from different budgets", () => {
  for (const method of [
    "replaceTransactionHistorySnapshot",
    "replaceImportHistorySnapshot",
  ]) {
    assert.throws(
      () => resolveOwnedBudgetId(method, [{
        expected: { budgetId: "budget-A" },
        replacement: { budgetId: "budget-B" },
      }]),
      { code: "BUDGET_OWNERSHIP_ROUTE_INVALID" },
    );
  }
});

test("unclassified methods fail closed instead of bypassing budget ownership", () => {
  assert.throws(
    () => resolveOwnedBudgetId("futureMethod", [{ budgetId: "budget-A" }]),
    { code: "BUDGET_OWNERSHIP_ROUTE_UNCLASSIFIED" },
  );
});

test("routing groups are disjoint", () => {
  const all = [
    ...OWNED_BUDGET_ROUTING_METHODS.firstArgumentBudget,
    ...OWNED_BUDGET_ROUTING_METHODS.firstArgumentObjectBudget,
    ...OWNED_BUDGET_ROUTING_METHODS.secondArgumentObjectBudget,
    ...OWNED_BUDGET_ROUTING_METHODS.nestedHistoryBudget,
  ];
  assert.equal(new Set(all).size, all.length);
});
