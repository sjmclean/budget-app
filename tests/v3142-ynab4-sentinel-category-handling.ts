import { readSeededTransactionRegisters } from "./helpers/transactionEntityFixtures.js";
import { createScheduledTransactionEntityRepository, projectScheduledTransaction } from "../apps/web/src/features/accounts/entities/scheduledTransactionEntity.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import { createFixedBudgetScopedStorage, getBudgetScopedStorageKey } from "../apps/web/src/features/budget/budgetDataScope.ts";
import { createYnab4LauncherBudgetImport } from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
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
    {
      entityId: "checking",
      accountName: "Checking",
      accountType: "Checking",
      onBudget: true,
    },
  ],
  masterCategories: [
    {
      entityId: "everyday",
      name: "Everyday",
      subCategories: [{ entityId: "groceries", name: "Groceries" }],
    },
  ],
  payees: [{ entityId: "employer", name: "Employer" }],
  monthlyBudgets: [
    {
      entityId: "month-2020-01",
      month: "2020-01-01",
      monthlySubCategoryBudgets: [
        { entityId: "budget-groceries", categoryId: "groceries", budgeted: 100 },
      ],
    },
  ],
  transactions: [
    {
      entityId: "immediate-income",
      accountId: "checking",
      date: "2020-01-01",
      amount: 1000,
      categoryId: "Category/__ImmediateIncome__",
      payeeId: "employer",
    },
    {
      entityId: "deferred-income",
      accountId: "checking",
      date: "2020-01-02",
      amount: 500,
      subCategoryId: "Category/__DeferredIncome__",
      payeeId: "employer",
    },
    {
      entityId: "split-parent",
      accountId: "checking",
      date: "2020-01-03",
      amount: -30,
      categoryId: "Category/__Split__",
      payeeId: "employer",
      subTransactions: [
        {
          entityId: "split-groceries",
          amount: -30,
          categoryId: "groceries",
        },
      ],
    },
  ],
  scheduledTransactions: [
    {
      entityId: "scheduled-income",
      accountId: "checking",
      date: "2020-02-01",
      amount: 700,
      categoryId: "Category/__ImmediateIncome__",
      payeeId: "employer",
      frequency: "monthly",
    },
    {
      entityId: "scheduled-split",
      accountId: "checking",
      date: "2020-02-02",
      amount: -20,
      categoryId: "Category/__Split__",
      payeeId: "employer",
      frequency: "monthly",
      subTransactions: [
        {
          entityId: "scheduled-groceries",
          amount: -20,
          categoryId: "groceries",
        },
      ],
    },
  ],
};

const entries: Ynab4PackageEntry[] = [
  {
    path: "Sentinels.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data" }),
  },
  {
    path: "Sentinels.ynab4/data/Budget.yfull",
    text: JSON.stringify(source),
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
  now: new Date("2026-07-15T00:00:00.000Z"),
});
assert.equal(result.record.accuracyAudit?.status, "pass");

const registers = readSeededTransactionRegisters(createFixedBudgetScopedStorage(storage, result.budget.id));
const transactions = Object.values(registers).flatMap(
  (register) => register.transactions,
);
for (const transactionId of ["immediate-income", "deferred-income"]) {
  const transaction = transactions.find((candidate) => candidate.id === transactionId);
  assert.ok(transaction);
  assert.equal(transaction.category, "Ready to Assign");
  assert.equal(transaction.categoryId, "__ready_to_assign__");
}
const splitParent = transactions.find((candidate) => candidate.id === "split-parent");
assert.ok(splitParent);
assert.equal(splitParent.category, "Split");
assert.equal(splitParent.categoryId, undefined);
assert.deepEqual(splitParent.splitLines?.map((line) => line.category), ["Groceries"]);

const scheduled = createScheduledTransactionEntityRepository(
  createFixedBudgetScopedStorage(storage, result.budget.id),
).list().map(projectScheduledTransaction) as Array<{
  id: string;
  category: string;
  categoryId?: string;
  splitLines?: Array<{ category: string }>;
}>;
const scheduledIncome = scheduled.find((item) => item.id === "scheduled-income");
assert.ok(scheduledIncome);
assert.equal(scheduledIncome.category, "Ready to Assign");
assert.equal(scheduledIncome.categoryId, "__ready_to_assign__");
const scheduledSplit = scheduled.find((item) => item.id === "scheduled-split");
assert.ok(scheduledSplit);
assert.equal(scheduledSplit.category, "Split");
assert.equal(scheduledSplit.categoryId, undefined);
assert.deepEqual(scheduledSplit.splitLines?.map((line) => line.category), ["Groceries"]);

const monthRaw = (() => { const view = readBudgetMonthEntity(storage, result.budget.id, "2020-01"); return view ? JSON.stringify(view) : null; })();
assert.ok(monthRaw);
const month = JSON.parse(monthRaw) as {
  categoryGroups: Array<{
    categories: Array<{ name: string; activity: number }>;
  }>;
};
const groceries = month.categoryGroups
  .flatMap((group) => group.categories)
  .find((category) => category.name === "Groceries");
assert.equal(groceries?.activity, -30);

const importerSource = readFileSync(
  "apps/web/src/features/budget/ynab4LauncherImport.ts",
  "utf8",
);
assert.match(importerSource, /Category\/__Split__/);
assert.match(importerSource, /Category\/__ImmediateIncome__/);
assert.match(importerSource, /Category\/__DeferredIncome__/);

console.log("v3.14.2 YNAB4 sentinel category handling passed");
