import assert from "node:assert/strict";

import { createBudgetViewService } from "../apps/web/src/features/budget/budgetViewService.ts";
import type { BudgetActivityPersistencePort, BudgetActivityRegisterTransaction } from "../apps/web/src/features/budget/budgetActivityPersistencePort.ts";
import type { BudgetMonthView } from "../apps/web/src/features/budget/budgetViewTypes.ts";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";

function createMemoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
    listKeys() {
      return [...values.keys()].sort();
    },
  };
}

function createBudgetActivity(transactions: BudgetActivityRegisterTransaction[]): BudgetActivityPersistencePort {
  return {
    async listRegisterTransactionsForBudgetActivity() {
      return transactions;
    },
    async countCategoryReferences() {
      return {
        registerTransactionCount: 0,
        registerSplitLineCount: 0,
        scheduledTransactionCount: 0,
      };
    },
    async renameRegisterCategoryReferences() {},
    async rewriteCategoryReferences() {},
  };
}

function createJulyBudgetView(): BudgetMonthView {
  return {
    budgetId: "household",
    budgetName: "Household Budget",
    monthLabel: "July 2026",
    currencyCode: "AUD",
    readyToAssign: 0,
    totalAssigned: 0,
    totalActivity: 0,
    totalAvailable: 1800,
    categoryGroups: [
      {
        id: "group-bills",
        name: "Bills",
        previousAvailable: 1800,
        assigned: 0,
        activity: 0,
        available: 1800,
        note: "",
        categories: [
          {
            id: "mortgage",
            name: "Mortgage",
            previousAvailable: 1800,
            assigned: 0,
            activity: 0,
            available: 1800,
            isOverspent: false,
            isArchived: false,
            note: "",
          },
        ],
      },
    ],
  };
}

async function testCategorizedTransfersCountAsBudgetActivity(): Promise<void> {
  const storage = createMemoryStorage();
  const budgetId = "household";
  const month = "2026-07";
  storage.setItem(
    `budget-app.budget-view.v1.${budgetId}.${month}`,
    JSON.stringify(createJulyBudgetView()),
  );

  const service = createBudgetViewService({
    storage,
    budgetActivity: createBudgetActivity([
      {
        id: "mortgage-payment",
        accountId: "checking",
        accountName: "Checking",
        accountType: "checking",
        transferAccountId: "mortgage-tracking-account",
        date: "2026-07-02",
        payee: "Transfer: Mortgage",
        category: "Mortgage",
        categoryId: "mortgage",
        inflow: 0,
        outflow: 1800,
      },
    ]),
  });

  const view = await service.getBudgetMonthView({ budgetId, month });
  const mortgage = view.categoryGroups.flatMap((group) => group.categories).find((category) => category.id === "mortgage");

  assert.ok(mortgage, "Mortgage category should remain available in the Budget view");
  assert.equal(mortgage.previousAvailable, 1800, "July should keep June's carried available amount");
  assert.equal(mortgage.assigned, 0, "July should not invent a new assigned amount");
  assert.equal(mortgage.activity, -1800, "Categorized transfers should count as current-month budget activity");
  assert.equal(mortgage.available, 0, "Current-month mortgage activity should consume the carried available balance");
}

await testCategorizedTransfersCountAsBudgetActivity();

console.log("v2.60.7 categorized transfer budget activity regression passed");
