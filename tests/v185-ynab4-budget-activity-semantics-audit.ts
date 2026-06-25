import assert from "node:assert/strict";

import {
  auditYnab4LauncherImportAccuracy,
  formatYnab4LauncherImportAccuracyAuditReport,
} from "../apps/web/src/features/budget/ynab4LauncherImportAccuracyAudit.ts";
import { createYnab4LauncherBudgetImport } from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
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
    path: "Audit Budget.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data1" }),
  },
  {
    path: "Audit Budget.ynab4/data1/DEVICE/Budget.yfull",
    text: JSON.stringify({
      accounts: [{ entityId: "account-1", name: "Checking", onBudget: true }],
      payees: [],
      masterCategories: [
        {
          entityId: "group-main",
          name: "Main Expenses",
          subCategories: [
            { entityId: "cat-groceries", name: "Groceries" },
            { entityId: "cat-mortgage", name: "Mortgage ($955/f)" },
          ],
        },
      ],
      transactions: [
        { entityId: "txn-groceries", accountId: "account-1", date: "2026-06-05", amount: -25, categoryId: "cat-groceries", payeeName: "Supermarket" },
        { entityId: "txn-mortgage", accountId: "account-1", date: "2026-06-06", amount: -878, categoryId: "cat-mortgage", payeeName: "Bank" },
      ],
      scheduledTransactions: [],
      monthlyBudgets: [
        {
          entityId: "month-2026-06",
          month: "2026-06",
          monthlySubCategoryBudgets: [
            { categoryId: "cat-groceries", budgeted: 100, activity: 0, balance: 100 },
            { categoryId: "cat-mortgage", budgeted: 955, activity: -955, balance: 0 },
          ],
        },
      ],
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
  now: new Date("2026-06-24T04:00:00.000Z"),
});

const audit = auditYnab4LauncherImportAccuracy(storage, {
  entries,
  budgetId: result.budget.id,
});
const report = formatYnab4LauncherImportAccuracyAuditReport(audit);

assert.equal(audit.status, "pass");
assert.match(report, /Budget Month Category Differences/);
assert.match(report, /2026-06 \/ Mortgage \(\$955\/f\)/);
assert.match(report, /Activity:\s+source=-955\.00, imported=-878\.00, delta=77\.00/);
assert.match(report, /Transaction Activity:\s+source=-878\.00, imported=-878\.00, delta=0\.00/);
assert.match(report, /Source Transactions:/);
assert.match(report, /2026-06-06 Checking Bank -878\.00 \[transaction\]/);
assert.match(report, /Imported Transactions:/);
assert.match(report, /2026-06-06 Checking Bank -878\.00 \[transaction\]/);
assert.match(report, /2026-06 \/ Groceries/);
assert.match(report, /Activity:\s+source=0\.00, imported=-25\.00, delta=-25\.00/);
assert.match(report, /Transaction Activity:\s+source=-25\.00, imported=-25\.00, delta=0\.00/);
assert.match(report, /2026-06-05 Checking Supermarket -25\.00 \[transaction\]/);

assert.match(report, /Budget Activity Semantics: sourceRow=-955\.00, sourceTransactions=-878\.00, sourceRowMinusTransactions=-77\.00, importedRow=-878\.00, importedTransactions=-878\.00, importedRowMinusTransactions=0\.00/);
assert.match(report, /Budget Activity Semantics: sourceRow=0\.00, sourceTransactions=-25\.00, sourceRowMinusTransactions=25\.00, importedRow=-25\.00, importedTransactions=-25\.00, importedRowMinusTransactions=0\.00/);
assert.match(report, /Interpretation: imported transaction activity matches source transaction activity; remaining difference comes from the YNAB4 budget-row activity value\./);

console.log("v1.85 YNAB4 budget activity semantics audit passed");
