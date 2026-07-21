import assert from "node:assert/strict";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import { createYnab4LauncherBudgetImport } from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
import {
  createYnab4PackageMigrationPreview,
  discoverYnab4Package,
  type Ynab4PackageEntry,
} from "../packages/ynab4-importer/src/analyzeYnab4Package.ts";

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
    path: "Historical Mortgage.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data1" }),
  },
  {
    path: "Historical Mortgage.ynab4/data1/Budget.yfull",
    text: JSON.stringify({
      accounts: [
        {
          entityId: "checking",
          accountName: "Checking",
          accountType: "Checking",
          onBudget: true,
          hidden: false,
        },
        {
          entityId: "home-loan",
          accountName: "Home loan",
          accountType: "Mortgage",
          onBudget: false,
          hidden: true,
        },
      ],
      masterCategories: [
        {
          entityId: "main-expenses",
          name: "Main Expenses",
          subCategories: [
            { entityId: "active-mortgage", name: "Mortgage ($955/f) $878" },
          ],
        },
        {
          entityId: "MasterCategory/__Hidden__",
          name: "Hidden Categories",
          subCategories: [
            {
              entityId: "old-mortgage",
              name: "Fortnight Two (2) ` Mortgage ` fortnight-two-2",
            },
          ],
        },
      ],
      payees: [{ entityId: "bank", name: "Bank" }],
      monthlyBudgets: [
        {
          entityId: "MB/2015-01",
          month: "2015-01-01",
          monthlySubCategoryBudgets: [
            {
              entityType: "monthlyCategoryBudget",
              categoryId: "old-mortgage",
              budgeted: 1886,
              entityId: "MCB/2015-01/old-mortgage",
              parentMonthlyBudgetId: "MB/2015-01",
            },
            {
              entityType: "monthlyCategoryBudget",
              categoryId: "active-mortgage",
              budgeted: 800,
              entityId: "MCB/2015-01/active-mortgage",
              parentMonthlyBudgetId: "MB/2015-01",
            },
          ],
        },
        {
          entityId: "MB/2015-02",
          month: "2015-02-01",
          monthlySubCategoryBudgets: [
            {
              entityType: "monthlyCategoryBudget",
              categoryId: "active-mortgage",
              budgeted: 0,
              entityId: "MCB/2015-02/active-mortgage",
              parentMonthlyBudgetId: "MB/2015-02",
            },
          ],
        },
      ],
      transactions: [
        {
          entityId: "txn-old-mortgage-payment",
          accountId: "checking",
          transferAccountId: "home-loan",
          payeeId: "bank",
          payeeName: "Bank",
          categoryId: "old-mortgage",
          date: "2015-01-13",
          amount: -1886,
        },
      ],
      scheduledTransactions: [],
    }),
  },
];

const storage = createMemoryStorage();
const discovery = discoverYnab4Package(entries);
const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");
assert.equal(preview.canContinue, true);

const result = createYnab4LauncherBudgetImport(storage, {
  discovery,
  preview,
  entries,
  now: new Date("2026-06-25T00:00:00.000Z"),
});

function readBudgetMonth(month: string) {
  const raw = storage.getItem(`budget-app.budget-view.v1.${result.budget.id}.${month}`);
  assert.ok(raw, `Expected imported ${month} budget view to be persisted.`);
  return JSON.parse(raw);
}

function findCategory(view: { categoryGroups: Array<{ name: string; categories: Array<{ id: string; name: string; assigned: number; activity: number; available: number; previousAvailable: number; isArchived: boolean }> }> }, groupName: string, categoryName: string) {
  const group = view.categoryGroups.find((candidate) => candidate.name === groupName);
  assert.ok(group, `Expected group ${groupName} to exist.`);
  const category = group.categories.find((candidate) => candidate.name === categoryName);
  assert.ok(category, `Expected category ${groupName} > ${categoryName} to exist.`);
  return category;
}

const january = readBudgetMonth("2015-01");
const oldMortgageJanuary = findCategory(january, "Hidden Categories", "Fortnight Two (2)/Mortgage");
const activeMortgageJanuary = findCategory(january, "Main Expenses", "Mortgage ($955/f) $878");

assert.equal(oldMortgageJanuary.isArchived, true);
assert.equal(oldMortgageJanuary.assigned, 1886);
assert.equal(oldMortgageJanuary.activity, -1886);
assert.equal(oldMortgageJanuary.available, 0);

assert.equal(activeMortgageJanuary.isArchived, false);
assert.equal(activeMortgageJanuary.assigned, 800);
assert.equal(activeMortgageJanuary.activity, 0);
assert.equal(activeMortgageJanuary.available, 800);

const february = readBudgetMonth("2015-02");
const oldMortgageFebruary = findCategory(february, "Hidden Categories", "Fortnight Two (2)/Mortgage");
const activeMortgageFebruary = findCategory(february, "Main Expenses", "Mortgage ($955/f) $878");

assert.equal(oldMortgageFebruary.previousAvailable, 0);
assert.equal(oldMortgageFebruary.available, 0);
assert.equal(activeMortgageFebruary.previousAvailable, 800);
assert.equal(activeMortgageFebruary.available, 800);

console.log("v1.90 YNAB4 budgeted archived category activity fidelity passed");
