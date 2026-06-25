import assert from "node:assert/strict";

import { createBudgetViewService } from "../apps/web/src/features/budget/budgetViewService.ts";
import { isMoneyNegative, isMoneyZero, normaliseMoney } from "../apps/web/src/features/budget/moneyMath.ts";
import type { BudgetActivityPersistencePort } from "../apps/web/src/features/budget/budgetActivityPersistencePort.ts";
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

function createMemoryBudgetActivity(): BudgetActivityPersistencePort {
  return {
    async listRegisterTransactionsForBudgetActivity() {
      return [
        {
          id: "txn-floating-point-spend",
          accountId: "checking",
          accountName: "Checking",
          accountType: "on-budget",
          date: "2026-06-05",
          payee: "Floating Point Store",
          category: "Groceries",
          categoryId: "groceries",
          inflow: 0,
          outflow: 0.3,
        },
      ];
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

function createStoredBudgetView(): BudgetMonthView {
  return {
    budgetId: "household",
    budgetName: "Household Budget",
    monthLabel: "June 2026",
    currencyCode: "AUD",
    readyToAssign: 0,
    totalAssigned: 0,
    totalActivity: 0,
    totalAvailable: 0,
    categoryGroups: [
      {
        id: "main-expenses",
        name: "Main Expenses",
        previousAvailable: 0.1,
        assigned: 0.2,
        activity: 0,
        available: 0.3,
        note: "",
        categories: [
          {
            id: "groceries",
            name: "Groceries",
            previousAvailable: 0.1,
            assigned: 0.2,
            activity: 0,
            available: 0.3,
            isOverspent: false,
            isArchived: false,
            note: "",
          },
        ],
      },
    ],
  };
}

assert.equal(isMoneyZero(-0.0049), true);
assert.equal(isMoneyNegative(-0.0049), false);
assert.equal(normaliseMoney(-0.0049), 0);
assert.equal(isMoneyNegative(-0.01), true);

const storage = createMemoryStorage();
storage.setItem(
  "budget-app.budget-view.v1.household.2026-06",
  JSON.stringify(createStoredBudgetView()),
);

const service = createBudgetViewService({
  storage,
  budgetActivity: createMemoryBudgetActivity(),
});

const view = await service.getBudgetMonthView({
  budgetId: "household",
  month: "2026-06",
});
const groceries = view.categoryGroups[0]?.categories[0];
assert.ok(groceries);
assert.equal(groceries.activity, -0.3);
assert.equal(groceries.available, 0);
assert.equal(groceries.isOverspent, false);
assert.equal(view.totalAvailable, 0);
assert.equal(view.categoryGroups[0]?.available, 0);

console.log("v1.93 money tolerance tests passed");
