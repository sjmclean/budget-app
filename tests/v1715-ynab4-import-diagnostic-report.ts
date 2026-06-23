import assert from "node:assert/strict";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import {
  createYnab4LauncherBudgetImport,
  readYnab4LauncherImportRecord,
} from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
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

function createRegisterQuotaStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();
  let rejectedRegisterWrite = false;

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (!rejectedRegisterWrite && key.includes("budget-app.account-registers.v1")) {
        rejectedRegisterWrite = true;
        throw new DOMException("Setting the value exceeded the quota.", "QuotaExceededError");
      }
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

function createEntries(transactionCount: number): Ynab4PackageEntry[] {
  const transactions = Array.from({ length: transactionCount }, (_, index) => ({
    entityId: `txn-${index}`,
    accountId: index % 5 === 0 ? "closed" : "checking",
    payeeId: "p1",
    categoryId: "groceries",
    date: `2020-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
    amount: -1000,
    memo: `Imported transaction ${index}`,
  }));

  return [
    {
      path: "Family Budget.ynab4/Budget.ymeta",
      text: JSON.stringify({ relativeDataFolderName: "data1" }),
    },
    {
      path: "Family Budget.ynab4/data1/Budget.yfull",
      text: JSON.stringify({
        accounts: [
          { accountId: "checking", name: "Cheque", accountType: "Checking" },
          { accountId: "closed", name: "Old Savings", accountType: "Savings", closed: true },
        ],
        masterCategories: [
          {
            masterCategoryId: "everyday",
            name: "Everyday",
            subCategories: [{ entityId: "groceries", name: "Groceries" }],
          },
        ],
        payees: [{ entityId: "p1", name: "Shop" }],
        monthlyBudgets: [
          {
            entityId: "mb1",
            month: "2020-12",
            monthlySubCategoryBudgets: [
              { categoryId: "groceries", budgeted: 250000, activity: -120000, balance: 130000 },
            ],
          },
        ],
        transactions,
        scheduledTransactions: [],
      }),
    },
  ];
}

function preparePreview(entries: Ynab4PackageEntry[]) {
  const discovery = discoverYnab4Package(entries);
  const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");
  assert.equal(preview.canContinue, true);
  return { discovery, preview };
}

function testDiagnosticReportIsStoredForSuccessfulLauncherImport() {
  const storage = createMemoryStorage();
  const entries = createEntries(12);
  const { discovery, preview } = preparePreview(entries);

  const result = createYnab4LauncherBudgetImport(storage, {
    discovery,
    preview,
    entries,
    now: new Date("2026-06-24T00:00:00.000Z"),
  });

  const record = readYnab4LauncherImportRecord(storage, result.budget.id);
  assert.ok(record);
  assert.ok(record.accuracyAudit);
  assert.ok(record.accuracyAuditReport);
  assert.match(record.accuracyAuditReport, /v1\.71\.5 YNAB4 Import Diagnostic Report/);
  assert.match(record.accuracyAuditReport, /Accounts/);
  assert.match(record.accuracyAuditReport, /Transactions/);
  assert.match(record.accuracyAuditReport, /Budget Months/);
}

function testDiagnosticReportFlagsQuotaTruncatedTransactionHistory() {
  const storage = createRegisterQuotaStorage();
  const entries = createEntries(1_250);
  const { discovery, preview } = preparePreview(entries);

  const result = createYnab4LauncherBudgetImport(storage, {
    discovery,
    preview,
    entries,
    now: new Date("2026-06-24T00:05:00.000Z"),
  });

  const record = readYnab4LauncherImportRecord(storage, result.budget.id);
  assert.ok(record);
  assert.equal(record.accuracyAudit?.status, "fail");
  assert.ok(record.accuracyAudit?.imported.transactions);
  assert.ok(record.accuracyAudit.imported.transactions < record.accuracyAudit.source.transactions);
  assert.match(record.accuracyAuditReport ?? "", /Transaction history is incomplete/);
  assert.match(record.accuracyAuditReport ?? "", /Accounts With Transaction Count Mismatches/);
}

function testFormatterCanBeUsedAgainstPersistedBudgetData() {
  const storage = createMemoryStorage();
  const entries = createEntries(8);
  const { discovery, preview } = preparePreview(entries);
  const result = createYnab4LauncherBudgetImport(storage, { discovery, preview, entries });

  const audit = auditYnab4LauncherImportAccuracy(storage, {
    entries,
    budgetId: result.budget.id,
  });
  const report = formatYnab4LauncherImportAccuracyAuditReport(audit);

  assert.match(report, /Source total: 2/);
  assert.match(report, /Imported total: 2/);
  assert.match(report, /Source closed-account transactions:/);
}

testDiagnosticReportIsStoredForSuccessfulLauncherImport();
testDiagnosticReportFlagsQuotaTruncatedTransactionHistory();
testFormatterCanBeUsedAgainstPersistedBudgetData();

console.log("v1.71.5 YNAB4 import diagnostic report tests passed");
