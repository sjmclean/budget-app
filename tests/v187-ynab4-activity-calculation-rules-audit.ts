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
    path: "Rules Audit.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data1" }),
  },
  {
    path: "Rules Audit.ynab4/data1/Budget.yfull",
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
          entityId: "home-loan",
          accountName: "Home Loan",
          accountType: "Mortgage",
          onBudget: false,
          hidden: true,
        },
      ],
      masterCategories: [
        {
          entityId: "main",
          name: "Main Expenses",
          subCategories: [
            { entityId: "mortgage", name: "Mortgage ($955/f)" },
          ],
        },
      ],
      payees: [{ entityId: "bank", name: "Bank" }],
      monthlyBudgets: [
        {
          entityId: "MB/2026-06",
          month: "2026-06-01",
          monthlySubCategoryBudgets: [
            {
              entityType: "monthlyCategoryBudget",
              categoryId: "mortgage",
              budgeted: 955,
              overspendingHandling: "Confined",
              entityId: "MCB/2026-06/mortgage",
              parentMonthlyBudgetId: "MB/2026-06",
            },
          ],
        },
      ],
      transactions: [
        {
          entityId: "txn-mortgage",
          accountId: "checking",
          transferAccountId: "home-loan",
          payeeId: "bank",
          payeeName: "Bank",
          categoryId: "mortgage",
          date: "2026-06-06",
          amount: -878,
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
assert.match(report, /YNAB4 Activity Calculation Rule Inputs/);
assert.match(report, /2026-06 \/ Mortgage \(\$955\/f\)/);
assert.match(report, /Overspending handling: Confined/);
assert.match(report, /Transaction-derived activity: source=-878\.00, imported=0\.00, delta=878\.00/);
assert.match(report, /Source Rule Transactions:/);
assert.match(report, /2026-06-06 Checking Bank -878\.00 \[transaction\]/);
assert.match(report, /accountType=Checking onBudget=true hidden=false/);
assert.match(report, /transferTo=Home Loan transferAccountType=Mortgage transferOnBudget=false/);

console.log(report);
console.log("v1.87 YNAB4 activity calculation rules audit passed");
