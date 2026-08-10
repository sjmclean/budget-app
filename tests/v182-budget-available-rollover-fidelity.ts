import assert from "node:assert/strict";

import { createBudgetViewService } from "../apps/web/src/features/budget/budgetViewService.ts";
import { createYnab4LauncherBudgetImport } from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
import type { BudgetActivityPersistencePort } from "../apps/web/src/features/budget/budgetActivityPersistencePort.ts";
import type { BudgetMonthView } from "../apps/web/src/features/budget/budgetViewTypes.ts";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import {
  createYnab4PackageMigrationPreview,
  discoverYnab4Package,
  type Ynab4PackageEntry,
} from "../packages/ynab4-importer/src/analyzeYnab4Package.ts";
import { readBudgetMonthEntity, writeBudgetMonthEntity } from "../apps/web/src/features/budget/entities/budgetMonthEntity.js";

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

const entries: Ynab4PackageEntry[] = [
  {
    path: "Carry Forward.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data1" }),
  },
  {
    path: "Carry Forward.ynab4/data1/DEVICE/Budget.yfull",
    text: JSON.stringify({
      accounts: [{ entityId: "account-1", name: "Checking", onBudget: true }],
      payees: [],
      masterCategories: [
        {
          entityId: "group-main",
          name: "Main Expenses",
          subCategories: [{ entityId: "cat-groceries", name: "Groceries" }],
        },
      ],
      transactions: [
        { entityId: "txn-jan", accountId: "account-1", date: "2026-01-05", amount: -25, categoryId: "cat-groceries" },
        { entityId: "txn-feb", accountId: "account-1", date: "2026-02-05", amount: -10, categoryId: "cat-groceries" },
        { entityId: "txn-mar", accountId: "account-1", date: "2026-03-05", amount: -15, categoryId: "cat-groceries" },
      ],
      scheduledTransactions: [],
      // Deliberately unordered to prove import rollover is chronological, not source-order dependent.
      monthlyBudgets: [
        {
          entityId: "month-2026-02",
          month: "2026-02",
          monthlySubCategoryBudgets: [{ categoryId: "cat-groceries", budgeted: 50 }],
        },
        {
          entityId: "month-2026-01",
          month: "2026-01",
          monthlySubCategoryBudgets: [{ categoryId: "cat-groceries", budgeted: 100 }],
        },
        {
          entityId: "month-2026-03",
          month: "2026-03",
          monthlySubCategoryBudgets: [{ categoryId: "cat-groceries", budgeted: 0 }],
        },
      ],
    }),
  },
];

function importBudgetViews(): { storage: KeyValueStoragePort; budgetId: string } {
  const storage = createMemoryStorage();
  const discovery = discoverYnab4Package(entries);
  const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");
  assert.equal(preview.canContinue, true);
  const result = createYnab4LauncherBudgetImport(storage, {
    discovery,
    preview,
    entries,
    now: new Date("2026-06-24T04:00:00.000Z"),
  });
  return { storage, budgetId: result.budget.id };
}

function readImportedMonth(storage: KeyValueStoragePort, budgetId: string, month: string): BudgetMonthView {
  const view = readBudgetMonthEntity(storage, budgetId, month);
  assert.ok(view, `expected imported month ${month}`);
  return view;
}

function findCategory(view: BudgetMonthView, categoryName: string) {
  for (const group of view.categoryGroups) {
    const category = group.categories.find((item) => item.name === categoryName);
    if (category) return category;
  }
  assert.fail(`Missing category ${categoryName}`);
}

function validateYnab4ImportCarriesAvailableForward(): void {
  const { storage, budgetId } = importBudgetViews();
  const january = findCategory(readImportedMonth(storage, budgetId, "2026-01"), "Groceries");
  const february = findCategory(readImportedMonth(storage, budgetId, "2026-02"), "Groceries");
  const march = findCategory(readImportedMonth(storage, budgetId, "2026-03"), "Groceries");

  assert.equal(january.previousAvailable, 0);
  assert.equal(january.assigned, 100);
  assert.equal(january.activity, -25);
  assert.equal(january.available, 75);

  assert.equal(february.previousAvailable, 75);
  assert.equal(february.assigned, 50);
  assert.equal(february.activity, -10);
  assert.equal(february.available, 115);

  assert.equal(march.previousAvailable, 115);
  assert.equal(march.assigned, 0);
  assert.equal(march.activity, -15);
  assert.equal(march.available, 100);
}

async function validateRuntimeRecalculationPreservesCarryForward(): Promise<void> {
  const storage = createMemoryStorage();
  writeBudgetMonthEntity(storage, "household", "2026-02", {
      budgetId: "household",
      budgetName: "Household Budget",
      monthLabel: "February 2026",
      currencyCode: "AUD",
      readyToAssign: 0,
      totalAssigned: 0,
      totalActivity: 0,
      totalAvailable: 0,
      categoryGroups: [
        {
          id: "main-expenses",
          name: "Main Expenses",
          previousAvailable: 75,
          assigned: 50,
          activity: 999,
          available: 1124,
          note: "",
          categories: [
            {
              id: "groceries",
              name: "Groceries",
              previousAvailable: 75,
              assigned: 50,
              activity: 999,
              available: 1124,
              isOverspent: false,
              isArchived: false,
              note: "",
            },
          ],
        },
      ],
    });

  const service = createBudgetViewService({
    storage,
    budgetActivity: createMemoryBudgetActivity(),
  });
  const view = await service.getBudgetMonthView({ budgetId: "household", month: "2026-02" });
  const groceries = findCategory(view, "Groceries");

  assert.equal(groceries.previousAvailable, 75);
  assert.equal(groceries.assigned, 50);
  assert.equal(groceries.activity, -10);
  assert.equal(groceries.available, 115);
  assert.equal(view.totalAvailable, 115);
}

function createMemoryBudgetActivity(): BudgetActivityPersistencePort {
  return {
    async listRegisterTransactionsForBudgetActivity() {
      return [
        {
          id: "txn-feb",
          accountId: "checking",
          accountName: "Checking",
          accountType: "on-budget",
          date: "2026-02-05",
          payee: "Grocer",
          category: "Groceries",
          categoryId: "groceries",
          inflow: 0,
          outflow: 10,
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

validateYnab4ImportCarriesAvailableForward();
await validateRuntimeRecalculationPreservesCarryForward();

console.log("v1.82 budget available rollover fidelity passed");
