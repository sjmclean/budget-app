import { createScheduledTransactionEntityRepository, projectScheduledTransaction } from "../apps/web/src/features/accounts/entities/scheduledTransactionEntity.js";
import assert from "node:assert/strict";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import { createYnab4LauncherBudgetImport } from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
import { createFixedBudgetScopedStorage, getBudgetScopedStorageKey } from "../apps/web/src/features/budget/budgetDataScope.ts";
import {
  createYnab4PackageMigrationPreview,
  discoverYnab4Package,
  type Ynab4PackageEntry,
} from "../packages/ynab4-importer/src/analyzeYnab4Package.ts";

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
  monthlyBudgets: [],
  transactions: [
    {
      entityId: "seed-transaction",
      accountId: "checking",
      date: "2020-01-01",
      amount: -1,
      categoryId: "groceries",
      payeeId: "merchant",
    },
  ],
  scheduledTransactions: [
    {
      entityId: "tracking-scheduled",
      accountId: "investment",
      nextDueDate: "2020-02-10",
      frequency: "Monthly",
      amount: -30,
      categoryId: "groceries",
      payeeId: "merchant",
    },
    {
      entityId: "tracking-scheduled-split",
      accountId: "investment",
      nextDueDate: "2020-02-11",
      frequency: "Monthly",
      amount: -40,
      categoryId: "Category/__Split__",
      payeeId: "merchant",
      subTransactions: [
        { entityId: "tracking-scheduled-split-line", amount: -40, categoryId: "groceries" },
      ],
    },
    {
      entityId: "budget-scheduled",
      accountId: "checking",
      nextDueDate: "2020-02-12",
      frequency: "Monthly",
      amount: -20,
      categoryId: "groceries",
      payeeId: "merchant",
    },
  ],
};

const entries: Ynab4PackageEntry[] = [
  { path: "ScheduledTracking.ynab4/Budget.ymeta", text: JSON.stringify({ relativeDataFolderName: "data" }) },
  { path: "ScheduledTracking.ynab4/data/Budget.yfull", text: JSON.stringify(source) },
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

const scheduled = createScheduledTransactionEntityRepository(
  createFixedBudgetScopedStorage(storage, result.budget.id),
).list().map(projectScheduledTransaction) as Array<{
  id: string;
  accountId: string;
  category: string;
  categoryId?: string;
  splitLines?: Array<{ category: string; categoryId?: string }>;
}>;

const tracking = scheduled.find((transaction) => transaction.id === "tracking-scheduled");
assert.ok(tracking);
assert.equal(tracking.category, "Uncategorised");
assert.equal(tracking.categoryId, undefined);

const trackingSplit = scheduled.find((transaction) => transaction.id === "tracking-scheduled-split");
assert.ok(trackingSplit);
assert.equal(trackingSplit.category, "Uncategorised");
assert.equal(trackingSplit.categoryId, undefined);
assert.equal(trackingSplit.splitLines?.length, 1);
assert.equal(trackingSplit.splitLines?.[0]?.category, "Uncategorised");
assert.equal(trackingSplit.splitLines?.[0]?.categoryId, undefined);

const budgetScheduled = scheduled.find((transaction) => transaction.id === "budget-scheduled");
assert.ok(budgetScheduled);
assert.equal(budgetScheduled.category, "Groceries");
assert.notEqual(budgetScheduled.categoryId, undefined);

console.log("v3.15.1 YNAB4 scheduled tracking-account isolation passed");
