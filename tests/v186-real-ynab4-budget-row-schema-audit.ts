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

function createRealYnab4ShapedEntries(): Ynab4PackageEntry[] {
  return [
    {
      path: "My Budget.ynab4/Budget.ymeta",
      text: JSON.stringify({ relativeDataFolderName: "data1" }),
    },
    {
      path: "My Budget.ynab4/data1/Budget.yfull",
      text: JSON.stringify({
        accounts: [{ entityId: "checking", name: "Checking", accountType: "Checking" }],
        masterCategories: [
          {
            entityId: "main",
            name: "Main Expenses",
            subCategories: [
              { entityId: "groceries", name: "Groceries" },
              { entityId: "mortgage", name: "Mortgage ($955/f) $878" },
            ],
          },
        ],
        payees: [{ entityId: "supermarket", name: "Supermarket" }],
        monthlyBudgets: [
          {
            entityId: "MB/2026-06",
            month: "2026-06-01",
            monthlySubCategoryBudgets: [
              {
                entityType: "monthlyCategoryBudget",
                categoryId: "groceries",
                budgeted: 100,
                overspendingHandling: null,
                entityId: "MCB/2026-06/groceries",
                parentMonthlyBudgetId: "MB/2026-06",
              },
              {
                entityType: "monthlyCategoryBudget",
                categoryId: "mortgage",
                budgeted: 955,
                overspendingHandling: "confined",
                entityId: "MCB/2026-06/mortgage",
                parentMonthlyBudgetId: "MB/2026-06",
              },
            ],
          },
        ],
        transactions: [
          {
            entityId: "txn-groceries",
            accountId: "checking",
            payeeId: "supermarket",
            payeeName: "Supermarket",
            categoryId: "groceries",
            date: "2026-06-05",
            amount: -25,
          },
        ],
        scheduledTransactions: [],
      }),
    },
  ];
}

const storage = createMemoryStorage();
const entries = createRealYnab4ShapedEntries();
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

assert.equal(audit.source.budgetMonthSourceRowSchema.totalRows, 2);
assert.equal(audit.source.budgetMonthSourceRowSchema.rowsWithBudgeted, 2);
assert.equal(audit.source.budgetMonthSourceRowSchema.rowsWithActivity, 0);
assert.equal(audit.source.budgetMonthSourceRowSchema.rowsWithAvailable, 0);
assert.equal(audit.source.budgetMonthSourceRowSchema.rowsWithBalance, 0);
assert.equal(audit.source.budgetMonthSourceRowSchema.rowsWithOverspendingHandling, 1);
assert.match(report, /Budget Month Source Row Schema/);
assert.match(report, /does not expose budget-row activity fields/);
assert.doesNotMatch(report, /Budget month 2026-06 activity differs/);
assert.doesNotMatch(report, /Budget month 2026-06 available differs/);
assert.doesNotMatch(report, /category Groceries differs/);

console.log(report);
console.log("v1.86 real YNAB4 budget row schema audit passed");
