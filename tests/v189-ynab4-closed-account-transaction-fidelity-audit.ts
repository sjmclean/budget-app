import assert from "node:assert/strict";
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
    path: "Closed Account.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data1" }),
  },
  {
    path: "Closed Account.ynab4/data1/Budget.yfull",
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
          entityId: "old-visa",
          accountName: "Old Visa",
          accountType: "CreditCard",
          onBudget: true,
          closed: true,
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
      payees: [
        { entityId: "store", name: "Store" },
        { entityId: "payment", name: "Payment" },
      ],
      monthlyBudgets: [],
      transactions: [
        {
          entityId: "closed-1",
          accountId: "old-visa",
          payeeId: "store",
          payeeName: "Store",
          categoryId: "groceries",
          date: "2020-01-10",
          amount: -50,
        },
        {
          entityId: "closed-2",
          accountId: "old-visa",
          payeeId: "payment",
          payeeName: "Payment",
          date: "2020-01-20",
          amount: 50,
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

const audit = auditYnab4LauncherImportAccuracy(storage, {
  entries,
  budgetId: result.budget.id,
});
const report = formatYnab4LauncherImportAccuracyAuditReport(audit);

assert.equal(audit.status, "pass");
assert.equal(audit.source.closedAccounts, 1);
assert.equal(audit.imported.closedAccounts, 1);
assert.equal(audit.source.closedAccountTransactions, 2);
assert.equal(audit.imported.closedAccountTransactions, 2);
assert.match(report, /Closed\/Hidden Account Transaction Fidelity/);
assert.match(report, /Old Visa/);
assert.match(report, /Source: type=CreditCard, closed=true, hidden=true, transactions=2, transactionBalance=0\.00, first=2020-01-10, last=2020-01-20/);
assert.match(report, /Imported: type=credit-card, closed=true, transactions=2, transactionBalance=0\.00, first=2020-01-10, last=2020-01-20/);
assert.match(report, /Delta: transactions=0, transactionBalance=0\.00/);

console.log(report);
console.log("v1.89 YNAB4 closed account transaction fidelity audit passed");
