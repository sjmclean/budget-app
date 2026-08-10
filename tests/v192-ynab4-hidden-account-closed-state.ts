import assert from "node:assert/strict";
import { readAccounts } from "../apps/web/src/features/accounts/accountService.js";
import { createFixedBudgetScopedStorage } from "../apps/web/src/features/budget/budgetDataScope.js";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import { createYnab4LauncherBudgetImport } from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
import {
  auditYnab4LauncherImportAccuracy,
  formatYnab4LauncherImportAccuracyAuditReport,
} from "../apps/web/src/features/budget/ynab4LauncherImportAccuracyAudit.ts";
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
    path: "Hidden Account.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data1" }),
  },
  {
    path: "Hidden Account.ynab4/data1/Budget.yfull",
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
          entityId: "old-offset",
          accountName: "Old Offset",
          accountType: "Savings",
          onBudget: true,
          hidden: true,
        },
      ],
      masterCategories: [
        {
          entityId: "main",
          name: "Main Expenses",
          subCategories: [{ entityId: "groceries", name: "Groceries" }],
        },
      ],
      payees: [{ entityId: "store", name: "Store" }],
      monthlyBudgets: [],
      transactions: [
        {
          entityId: "hidden-1",
          accountId: "old-offset",
          payeeId: "store",
          payeeName: "Store",
          categoryId: "groceries",
          date: "2020-01-10",
          amount: -50,
        },
        {
          entityId: "open-1",
          accountId: "checking",
          payeeId: "store",
          payeeName: "Store",
          categoryId: "groceries",
          date: "2020-01-11",
          amount: -25,
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

const accounts = readAccounts(createFixedBudgetScopedStorage(storage, result.budget.id));
assert.ok(accounts.length > 0, "Expected Account entities to be persisted.");
const oldOffset = accounts.find((account) => account.name === "Old Offset");
assert.ok(oldOffset, "Expected hidden YNAB4 account to be imported.");
assert.equal(
  typeof oldOffset.closedAt,
  "string",
  "Expected hidden YNAB4 account to import as closed.",
);

const audit = auditYnab4LauncherImportAccuracy(storage, {
  entries,
  budgetId: result.budget.id,
});
const report = formatYnab4LauncherImportAccuracyAuditReport(audit);

assert.equal(audit.status, "pass");
assert.equal(audit.source.closedAccounts, 1);
assert.equal(audit.imported.closedAccounts, 1);
assert.equal(audit.source.closedAccountTransactions, 1);
assert.equal(audit.imported.closedAccountTransactions, 1);
assert.match(report, /Closed\/Hidden Account Transaction Fidelity/);
assert.match(report, /Old Offset/);
assert.match(report, /Source: type=Savings, closed=true, hidden=true, transactions=1/);
assert.match(report, /Imported: type=on-budget, closed=true, transactions=1/);

console.log(report);
console.log("v1.92 YNAB4 hidden account closed-state fidelity passed");
