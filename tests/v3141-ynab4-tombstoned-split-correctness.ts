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
      subCategories: [
        { entityId: "groceries", name: "Groceries" },
        { entityId: "fuel", name: "Fuel" },
      ],
    },
  ],
  payees: [{ entityId: "merchant", name: "Merchant" }],
  monthlyBudgets: [
    {
      entityId: "month-2020-01",
      month: "2020-01-01",
      monthlySubCategoryBudgets: [
        { entityId: "budget-groceries", categoryId: "groceries", budgeted: 100 },
        { entityId: "budget-fuel", categoryId: "fuel", budgeted: 50 },
      ],
    },
  ],
  transactions: [
    {
      entityId: "split-transaction",
      accountId: "checking",
      date: "2020-01-10",
      amount: -30,
      categoryId: "Category/__Split__",
      payeeId: "merchant",
      subTransactions: [
        {
          entityId: "live-split",
          amount: -20,
          categoryId: "groceries",
          memo: "Keep me",
        },
        {
          entityId: "deleted-split",
          amount: -10,
          categoryId: "fuel",
          memo: "Delete me",
          isTombstone: true,
        },
      ],
    },
  ],
  scheduledTransactions: [
    {
      entityId: "scheduled-split",
      accountId: "checking",
      date: "2020-02-01",
      amount: -40,
      categoryId: "Category/__Split__",
      payeeId: "merchant",
      frequency: "monthly",
      subTransactions: [
        {
          entityId: "scheduled-live-split",
          amount: -25,
          categoryId: "groceries",
        },
        {
          entityId: "scheduled-deleted-split",
          amount: -15,
          categoryId: "fuel",
          deleted: true,
        },
      ],
    },
  ],
};

const entries: Ynab4PackageEntry[] = [
  {
    path: "Tombstones.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data" }),
  },
  {
    path: "Tombstones.ynab4/data/Budget.yfull",
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
const transaction = Object.values(registers)
  .flatMap((register) => register.transactions)
  .find((candidate) => candidate.id === "split-transaction");
assert.ok(transaction);
assert.deepEqual(
  transaction.splitLines?.map((line) => line.id),
  ["live-split"],
  "Tombstoned transaction split lines must not be imported.",
);

const scheduled = createScheduledTransactionEntityRepository(
  createFixedBudgetScopedStorage(storage, result.budget.id),
).list().map(projectScheduledTransaction) as Array<{
  id: string;
  splitLines?: Array<{ id: string }>;
}>;
assert.deepEqual(
  scheduled.find((item) => item.id === "scheduled-split")?.splitLines?.map((line) => line.id),
  ["scheduled-live-split"],
  "Tombstoned scheduled split lines must not be imported.",
);

const monthRaw = (() => { const view = readBudgetMonthEntity(storage, result.budget.id, "2020-01"); return view ? JSON.stringify(view) : null; })();
assert.ok(monthRaw);
const month = JSON.parse(monthRaw) as {
  categoryGroups: Array<{
    categories: Array<{ name: string; activity: number }>;
  }>;
};
const categories = month.categoryGroups.flatMap((group) => group.categories);
assert.equal(categories.find((category) => category.name === "Groceries")?.activity, -20);
assert.equal(
  categories.find((category) => category.name === "Fuel")?.activity,
  0,
  "Tombstoned split activity must be excluded from budget calculations.",
);

const importerSource = readFileSync(
  "apps/web/src/features/budget/ynab4LauncherImport.ts",
  "utf8",
);
const auditSource = readFileSync(
  "apps/web/src/features/budget/ynab4LauncherImportAccuracyAudit.ts",
  "utf8",
);
assert.match(importerSource, /lines\.filter\(\(line\) => !isYnab4Tombstone\(line\)\)/);
assert.match(auditSource, /toRecords\(transaction\.subTransactions\)\.filter\(/);

console.log("v3.14.1 YNAB4 tombstoned split correctness passed");
