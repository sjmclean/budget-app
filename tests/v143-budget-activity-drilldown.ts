import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createBudgetViewService } from "../apps/web/src/features/budget/budgetViewService.js";
import type { BudgetActivityPersistencePort } from "../apps/web/src/features/budget/budgetActivityPersistencePort.js";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.js";

const BUDGET_STORAGE_KEY = "budget-app.budget-view.v1.household.2026-06";

async function main() {
  await validateCategoryActivityDrilldownRows();
  validateBudgetPageWiresActivityModal();

  console.log("v1.43 budget activity drilldown validation passed");
}

async function validateCategoryActivityDrilldownRows(): Promise<void> {
  const storage = createMemoryStorage();
  storage.setItem(
    BUDGET_STORAGE_KEY,
    JSON.stringify({
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
          id: "living-expenses",
          name: "Living Expenses",
          assigned: 0,
          activity: 0,
          available: 0,
          categories: [
            {
              id: "groceries",
              name: "Groceries",
              assigned: 50000,
              activity: 0,
              available: 50000,
              isOverspent: false,
              isArchived: false,
            },
            {
              id: "fuel",
              name: "Fuel",
              assigned: 20000,
              activity: 0,
              available: 20000,
              isOverspent: false,
              isArchived: false,
            },
          ],
        },
      ],
    }),
  );

  const service = createBudgetViewService({
    storage,
    budgetActivity: createMemoryBudgetActivity(),
  });

  const drilldown = await service.getCategoryActivityDrilldown({
    budgetId: "household",
    month: "2026-06",
    categoryId: "groceries",
  });

  assert.equal(drilldown.categoryName, "Groceries", "drilldown should name the selected category");
  assert.deepEqual(
    drilldown.rows.map((row) => row.id),
    ["tx-normal", "tx-split:split-groceries", "tx-refund"],
    "drilldown should include normal, matching split, and refund rows in date order only",
  );
  assert.equal(drilldown.rows[1]?.isSplit, true, "matching split line should be identified as split activity");
  assert.equal(drilldown.rows[1]?.memo, "Produce", "split memo should be preferred over parent memo");
  assert.equal(drilldown.totalOutflow, 6300, "total outflow should sum matching category activity only");
  assert.equal(drilldown.totalInflow, 500, "total inflow should sum matching category activity only");
  assert.equal(drilldown.netActivity, -5800, "net activity should match the budget activity calculation");

  const budgetView = await service.getBudgetMonthView({
    budgetId: "household",
    month: "2026-06",
  });
  const groceries = budgetView.categoryGroups[0]?.categories.find((category) => category.id === "groceries");
  assert.equal(groceries?.activity, drilldown.netActivity, "drilldown net should match displayed category activity");
}

function validateBudgetPageWiresActivityModal(): void {
  const budgetPage = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");
  const budgetViewTypes = readFileSync("apps/web/src/features/budget/budgetViewTypes.ts", "utf8");
  const releaseScripts = readFileSync("package.json", "utf8");

  assert.match(budgetViewTypes, /BudgetActivityDrilldownRow/, "budget view types should expose drilldown rows");
  assert.match(budgetViewTypes, /getCategoryActivityDrilldown/, "budget service port should expose activity drilldown query");
  assert.match(budgetPage, /BudgetActivityDrilldownModal/, "budget page should render an activity drilldown modal");
  assert.match(budgetPage, /activity-drilldown-button/, "budget activity amount should be clickable");
  assert.match(budgetPage, /navigate\(`\/accounts\/\$\{row\.accountId\}`\)/, "activity row click should navigate to the account register");
  assert.match(releaseScripts, /test:v143/, "release scripts should include v1.43 validation");
}

function createMemoryBudgetActivity(): BudgetActivityPersistencePort {
  return {
    async listRegisterTransactionsForBudgetActivity() {
      return [
        {
          id: "tx-normal",
          accountId: "checking",
          accountName: "Everyday Account",
          accountType: "on-budget",
          date: "2026-06-01",
          payee: "Woolworths",
          category: "Groceries",
          categoryId: "groceries",
          memo: "Weekly shop",
          inflow: 0,
          outflow: 3300,
        },
        {
          id: "tx-split",
          accountId: "checking",
          accountName: "Everyday Account",
          accountType: "on-budget",
          date: "2026-06-04",
          payee: "Aldi",
          category: "Split",
          memo: "Split shop",
          inflow: 0,
          outflow: 3500,
          splitLines: [
            {
              id: "split-groceries",
              category: "Groceries",
              categoryId: "groceries",
              memo: "Produce",
              inflow: 0,
              outflow: 3000,
            },
            {
              id: "split-fuel",
              category: "Fuel",
              categoryId: "fuel",
              memo: "Petrol",
              inflow: 0,
              outflow: 500,
            },
          ],
        },
        {
          id: "tx-refund",
          accountId: "checking",
          accountName: "Everyday Account",
          accountType: "on-budget",
          date: "2026-06-08",
          payee: "Coles",
          category: "Groceries",
          categoryId: "groceries",
          memo: "Refund",
          inflow: 500,
          outflow: 0,
        },
        {
          id: "tx-other-month",
          accountId: "checking",
          accountName: "Everyday Account",
          accountType: "on-budget",
          date: "2026-05-30",
          payee: "Woolworths",
          category: "Groceries",
          categoryId: "groceries",
          memo: "Previous month",
          inflow: 0,
          outflow: 9999,
        },
        {
          id: "tx-ready-to-assign",
          accountId: "checking",
          accountName: "Everyday Account",
          accountType: "on-budget",
          date: "2026-06-10",
          payee: "Employer",
          category: "Ready to Assign",
          categoryId: "__ready_to_assign__",
          memo: "Income",
          inflow: 100000,
          outflow: 0,
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

function createMemoryStorage(): KeyValueStoragePort {
  const data = new Map<string, string>();

  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

await main();
