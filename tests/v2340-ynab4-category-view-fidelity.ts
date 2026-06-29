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
          entityId: "MasterCategory/__Hidden__",
          name: "Hidden Categories",
          subCategories: [
            { entityId: "hidden-groceries", name: "Old Group ` Groceries ` old-group-id" },
            { entityId: "hidden-child-care", name: "Main Expenses ` Child Care & Events ` main-expenses-id" },
          ],
        },
        { entityId: "empty-deleted-group", name: "Deleted Group", isTombstone: true, subCategories: [] },
        {
          entityId: "monthly-bills-id",
          name: "Monthly Bills",
          subCategories: [
            { entityId: "phone", name: "Phone" },
            { entityId: "cable-tv", name: "Cable TV", isTombstone: true },
          ],
        },
        {
          entityId: "main-expenses-id",
          name: "Main Expenses",
          subCategories: [
            { entityId: "groceries", name: "Groceries" },
            { entityId: "fuel", name: "Fuel" },
          ],
        },
      ],
      monthlyBudgets: [
        {
          entityId: "month-1",
          month: "2026-06",
          monthlySubCategoryBudgets: [
            { categoryId: "hidden-groceries", budgeted: 0, activity: 0, balance: 0 },
            { categoryId: "hidden-child-care", budgeted: 0, activity: 0, balance: 0 },
            { categoryId: "phone", budgeted: 25000, activity: -10000, balance: 15000 },
            { categoryId: "groceries", budgeted: 100000, activity: -35000, balance: 65000 },
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
    now: new Date("2026-06-29T00:00:00.000Z"),
  });
  const raw = storage.getItem(`budget-app.budget-view.v1.${result.budget.id}.2026-06`);
  assert.ok(raw);
  return JSON.parse(raw) as BudgetMonthView;
}

const view = importBudgetView();

assert.deepEqual(
  view.categoryGroups.map((group) => group.name),
  ["Hidden Categories", "Monthly Bills", "Main Expenses"],
);

const hiddenCategories = view.categoryGroups.find((group) => group.name === "Hidden Categories");
assert.ok(hiddenCategories);
assert.deepEqual(
  hiddenCategories.categories.map((category) => category.name),
  ["Groceries", "Child Care & Events"],
);
assert.equal(hiddenCategories.categories.every((category) => category.isArchived), true);

const monthlyBills = view.categoryGroups.find((group) => group.name === "Monthly Bills");
assert.ok(monthlyBills);
assert.deepEqual(
  monthlyBills.categories.map((category) => category.name),
  ["Phone", "Cable TV"],
);
assert.equal(monthlyBills.categories.find((category) => category.name === "Cable TV")?.isArchived, true);

const mainExpenses = view.categoryGroups.find((group) => group.name === "Main Expenses");
assert.ok(mainExpenses);
assert.deepEqual(
  mainExpenses.categories.map((category) => category.name),
  ["Groceries", "Fuel"],
);
assert.equal(mainExpenses.categories.find((category) => category.name === "Groceries")?.isArchived, false);

assert.equal(view.categoryGroups.some((group) => group.name === "Old Group"), false);
assert.equal(view.categoryGroups.some((group) => group.name === "Deleted Group"), false);

console.log("v2.34.0 YNAB4 category view fidelity passed");
