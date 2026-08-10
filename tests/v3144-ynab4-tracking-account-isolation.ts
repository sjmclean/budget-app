import { readSeededTransactionRegisters } from "./helpers/transactionEntityFixtures.js";
import assert from "node:assert/strict";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import { createYnab4LauncherBudgetImport } from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
import { createFixedBudgetScopedStorage, getBudgetScopedStorageKey } from "../apps/web/src/features/budget/budgetDataScope.ts";
import {
  createYnab4PackageMigrationPreview,
  discoverYnab4Package,
  type Ynab4PackageEntry,
} from "../packages/ynab4-importer/src/analyzeYnab4Package.ts";
import { readBudgetMonthEntity } from "../apps/web/src/features/budget/entities/budgetMonthEntity.js";

function createMemoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    listKeys: () => [...values.keys()].sort(),
  };
}

const source = {
  accounts: [
    { entityId: "checking", accountName: "Checking", accountType: "Checking", onBudget: true },
    { entityId: "investment", accountName: "Investment", accountType: "Investment", onBudget: false },
  ],
  masterCategories: [{
    entityId: "everyday",
    name: "Everyday",
    subCategories: [{ entityId: "groceries", name: "Groceries" }],
  }],
  payees: [{ entityId: "merchant", name: "Merchant" }],
  monthlyBudgets: [{
    entityId: "month-2020-01",
    month: "2020-01-01",
    monthlySubCategoryBudgets: [
      { entityId: "budget-groceries", categoryId: "groceries", budgeted: 100 },
    ],
  }],
  transactions: [
    { entityId: "budget-spend", accountId: "checking", date: "2020-01-10", amount: -20, categoryId: "groceries", payeeId: "merchant" },
    { entityId: "tracking-spend", accountId: "investment", date: "2020-01-11", amount: -30, categoryId: "groceries", payeeId: "merchant" },
    {
      entityId: "tracking-split",
      accountId: "investment",
      date: "2020-01-12",
      amount: -40,
      categoryId: "Category/__Split__",
      payeeId: "merchant",
      subTransactions: [
        { entityId: "tracking-split-line", amount: -40, categoryId: "groceries" },
      ],
    },
  ],
  scheduledTransactions: [],
};

const entries: Ynab4PackageEntry[] = [
  { path: "Tracking.ynab4/Budget.ymeta", text: JSON.stringify({ relativeDataFolderName: "data" }) },
  { path: "Tracking.ynab4/data/Budget.yfull", text: JSON.stringify(source) },
];
const storage = createMemoryStorage();
const discovery = discoverYnab4Package(entries);
const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");
assert.equal(preview.canContinue, true);
const result = createYnab4LauncherBudgetImport(storage, {
  discovery,
  preview,
  entries,
  now: new Date("2026-07-15T00:00:00.000Z"),
});
assert.equal(result.record.accuracyAudit?.status, "pass");

const monthRaw = (() => { const view = readBudgetMonthEntity(storage, result.budget.id, "2020-01"); return view ? JSON.stringify(view) : null; })();
assert.ok(monthRaw);
const monthView = JSON.parse(monthRaw) as {
  categoryGroups: Array<{ categories: Array<{ name: string; activity: number }> }>;
};
const groceries = monthView.categoryGroups
  .flatMap((group) => group.categories)
  .find((category) => category.name === "Groceries");
assert.ok(groceries);
assert.equal(groceries.activity, -20, "Tracking-account transactions must not affect budget activity.");

const registers = readSeededTransactionRegisters(createFixedBudgetScopedStorage(storage, result.budget.id));
const trackingRegister = registers.investment;
assert.ok(trackingRegister);

const trackingSpend = trackingRegister.transactions.find((transaction) => transaction.id === "tracking-spend");
assert.ok(trackingSpend);
assert.equal(trackingSpend.category, "Uncategorised");
assert.equal(trackingSpend.categoryId, undefined);

const trackingSplit = trackingRegister.transactions.find((transaction) => transaction.id === "tracking-split");
assert.ok(trackingSplit);
assert.equal(trackingSplit.category, "Uncategorised");
assert.equal(trackingSplit.categoryId, undefined);
assert.equal(trackingSplit.splitLines?.length, 1);
assert.equal(trackingSplit.splitLines?.[0]?.category, "Uncategorised");
assert.equal(trackingSplit.splitLines?.[0]?.categoryId, undefined);

console.log("v3.14.4 YNAB4 tracking-account activity isolation passed");
