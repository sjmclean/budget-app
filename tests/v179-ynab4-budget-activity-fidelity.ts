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
      masterCategories: [
        {
          entityId: "group-main",
          name: "Main Expenses",
          subCategories: [
            { entityId: "cat-groceries", name: "Groceries" },
            { entityId: "cat-medical", name: "Medical" },
            { entityId: "cat-transfer", name: "Transfer Category" },
          ],
        },
      ],
      transactions: [
        // Spending decreases category activity.
        { entityId: "txn-grocery-spend", accountId: "account-1", date: "2026-06-01", amount: -125.25, categoryId: "cat-groceries" },
        // Refunds/reimbursements directly to a category increase activity.
        { entityId: "txn-grocery-refund", accountId: "account-1", date: "2026-06-02", amount: 25, categoryId: "cat-groceries" },
        // Split lines contribute to their own categories, preserving sign.
        {
          entityId: "txn-split",
          accountId: "account-1",
          date: "2026-06-03",
          amount: -80,
          subTransactions: [
            { entityId: "split-groceries", amount: -50, categoryId: "cat-groceries" },
            { entityId: "split-medical", amount: -30, categoryId: "cat-medical" },
          ],
        },
        // Ready to Assign/income should not be treated as category activity.
        { entityId: "txn-income", accountId: "account-1", date: "2026-06-04", amount: 1000 },
        // Activity outside the imported budget month should not leak in.
        { entityId: "txn-other-month", accountId: "account-1", date: "2026-07-01", amount: -999, categoryId: "cat-groceries" },
      ],
      scheduledTransactions: [],
      monthlyBudgets: [
        {
          entityId: "month-2026-06",
          month: "2026-06",
          monthlySubCategoryBudgets: [
            { categoryId: "cat-groceries", budgeted: 200 },
            { categoryId: "cat-medical", budgeted: 100 },
            { categoryId: "cat-transfer", budgeted: 5 },
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

function findCategory(view: BudgetMonthView, categoryName: string) {
  for (const group of view.categoryGroups) {
    const category = group.categories.find((item) => item.name === categoryName);
    if (category) return category;
  }
  assert.fail(`Missing category ${categoryName}`);
}

const view = importBudgetView();
const groceries = findCategory(view, "Groceries");
const medical = findCategory(view, "Medical");
const transferCategory = findCategory(view, "Transfer Category");

assert.equal(groceries.assigned, 200);
assert.equal(groceries.activity, -150.25);
assert.equal(groceries.available, 49.75);
assert.equal(groceries.isOverspent, false);

assert.equal(medical.assigned, 100);
assert.equal(medical.activity, -30);
assert.equal(medical.available, 70);
assert.equal(medical.isOverspent, false);

assert.equal(transferCategory.assigned, 5);
assert.equal(transferCategory.activity, 0);
assert.equal(transferCategory.available, 5);

assert.equal(view.totalAssigned, 305);
assert.equal(view.totalActivity, -180.25);
assert.equal(view.totalAvailable, 124.75);

console.log("v1.79 YNAB4 budget activity fidelity passed");
