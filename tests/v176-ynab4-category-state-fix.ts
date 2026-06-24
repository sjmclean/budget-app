import assert from "node:assert/strict";
import { createYnab4LauncherBudgetImport } from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
import type { BudgetMonthView } from "../apps/web/src/features/budget/budgetViewTypes.ts";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
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
    path: "My Budget.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data33" }),
  },
  {
    path: "My Budget.ynab4/data33/DEVICE/Budget.yfull",
    text: JSON.stringify({
      accounts: [{ entityId: "account-1", name: "Checking", onBudget: true }],
      payees: [],
      transactions: [{ entityId: "txn-1", accountId: "account-1", date: "2026-06-01", amount: 0 }],
      scheduledTransactions: [],
      masterCategories: [
        {
          entityId: "A7",
          name: "Monthly Bills",
          subCategories: [
            { entityId: "A9", name: "Phone" },
            { entityId: "A11", name: "Cable TV", isTombstone: true },
            { entityId: "cat-pocket-money", name: "Pocket Money" },
          ],
        },
        {
          entityId: "main-expenses-id",
          name: "Main Expenses",
          subCategories: [
            { entityId: "cat-income-holding", name: "Income Holding" },
          ],
        },
        {
          entityId: "A32",
          name: "Savings Goals",
          subCategories: [
            { entityId: "cat-defered-income", name: "Defered Income" },
          ],
        },
        {
          entityId: "MasterCategory/__Hidden__",
          name: "Hidden Categories",
          subCategories: [
            { entityId: "hidden-child-care", name: "Main Expenses ` Child Care & Events ` main-expenses-id" },
            { entityId: "hidden-tv", name: "Savings Goals ` TV ` A32" },
            { entityId: "hidden-giving", name: "Giving ` Tithing ` A4" },
          ],
        },
        { entityId: "MasterCategory/__PreYNABDebtMaster__", name: "Pre-YNAB Debt", isTombstone: true, subCategories: [] },
        { entityId: "A4", name: "Giving", isTombstone: true, subCategories: [] },
        { entityId: "dup-pocket-money", name: "Pocket Money", isTombstone: true, subCategories: [] },
        { entityId: "dup-income-holding", name: "Income Holding", isTombstone: true, subCategories: [] },
        { entityId: "dup-defered-income", name: "Defered Income", isTombstone: true, subCategories: [] },
        { entityId: "new-master-1", name: "New Master Category", isTombstone: true, subCategories: [] },
        { entityId: "new-master-2", name: "New Master Category", isTombstone: true, subCategories: [] },
        { entityId: "new-master-3", name: "New Master Category", isTombstone: true, subCategories: [] },
      ],
      monthlyBudgets: [
        {
          entityId: "month-1",
          month: "2026-06",
          monthlySubCategoryBudgets: [
            { categoryId: "cat-pocket-money", budgeted: 100000, activity: -25000, balance: 75000 },
            { categoryId: "hidden-child-care", budgeted: 0, activity: 0, balance: 0 },
            { categoryId: "hidden-tv", budgeted: 0, activity: 0, balance: 0 },
            { categoryId: "hidden-giving", budgeted: 0, activity: 0, balance: 0 },
            { categoryId: "A11", budgeted: 0, activity: 0, balance: 0 },
          ],
        },
      ],
    }),
  },
];

function importBudgetView(): BudgetMonthView {
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
  const raw = storage.getItem(`budget-app.budget-view.v1.${result.budget.id}.2026-06`);
  assert.ok(raw);
  return JSON.parse(raw) as BudgetMonthView;
}

function categoryNames(view: BudgetMonthView): string[] {
  return view.categoryGroups.flatMap((group) => group.categories.map((category) => `${group.name} > ${category.name}`));
}

function testTombstonedMasterCategoriesDoNotBecomeEmptyGroups() {
  const view = importBudgetView();
  const emptyGroupNames = view.categoryGroups.filter((group) => group.categories.length === 0).map((group) => group.name);

  assert.equal(emptyGroupNames.includes("Pocket Money"), false);
  assert.equal(emptyGroupNames.includes("Income Holding"), false);
  assert.equal(emptyGroupNames.includes("Defered Income"), false);
  assert.equal(emptyGroupNames.includes("New Master Category"), false);
  assert.equal(emptyGroupNames.includes("Pre-YNAB Debt"), false);
}

function testHiddenYnab4CategoriesAreArchivedUnderTheirOriginalGroups() {
  const view = importBudgetView();
  const names = categoryNames(view);

  assert.equal(names.includes("Main Expenses > Child Care & Events"), true);
  assert.equal(names.includes("Savings Goals > TV"), true);
  assert.equal(names.includes("Giving > Tithing"), true);

  const mainExpenses = view.categoryGroups.find((group) => group.name === "Main Expenses");
  const savingsGoals = view.categoryGroups.find((group) => group.name === "Savings Goals");
  const giving = view.categoryGroups.find((group) => group.name === "Giving");
  assert.ok(mainExpenses);
  assert.ok(savingsGoals);
  assert.ok(giving);

  assert.equal(mainExpenses.categories.find((category) => category.name === "Child Care & Events")?.isArchived, true);
  assert.equal(savingsGoals.categories.find((category) => category.name === "TV")?.isArchived, true);
  assert.equal(giving.categories.find((category) => category.name === "Tithing")?.isArchived, true);
}

function testTombstonedSubcategoriesRemainArchivedForHistoricalReferences() {
  const view = importBudgetView();
  const monthlyBills = view.categoryGroups.find((group) => group.name === "Monthly Bills");
  assert.ok(monthlyBills);

  assert.equal(monthlyBills.categories.find((category) => category.name === "Cable TV")?.isArchived, true);
  assert.equal(monthlyBills.categories.find((category) => category.name === "Pocket Money")?.isArchived, false);
}

testTombstonedMasterCategoriesDoNotBecomeEmptyGroups();
testHiddenYnab4CategoriesAreArchivedUnderTheirOriginalGroups();
testTombstonedSubcategoriesRemainArchivedForHistoricalReferences();

console.log("v1.76 YNAB4 category state fix passed");
