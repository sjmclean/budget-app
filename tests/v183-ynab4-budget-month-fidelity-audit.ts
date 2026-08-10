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
        { entityId: "txn-groceries", accountId: "account-1", date: "2026-06-05", amount: -25, categoryId: "cat-groceries" },
        { entityId: "txn-mortgage", accountId: "account-1", date: "2026-06-06", amount: -878, categoryId: "cat-mortgage" },
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
assert.equal(audit.source.budgetMonthCategoryValues["2026-06"]?.["source:cat-groceries"]?.assigned, 100);
assert.equal(audit.imported.budgetMonthCategoryValues["2026-06"]?.["source:cat-groceries"]?.activity, -25);
assert.equal(audit.source.budgetMonthCategoryValues["2026-06"]?.["source:cat-mortgage"]?.activity, -955);
assert.equal(audit.imported.budgetMonthCategoryValues["2026-06"]?.["source:cat-mortgage"]?.activity, -878);

assert.match(report, /Budget Month Category Differences/);
assert.match(report, /2026-06 \/ Groceries/);
assert.match(report, /Activity:\s+source=0\.00, imported=-25\.00, delta=-25\.00/);
assert.match(report, /2026-06 \/ Mortgage \(\$955\/f\)/);
assert.match(report, /Activity:\s+source=-955\.00, imported=-878\.00, delta=77\.00/);

console.log("v1.83 YNAB4 budget month fidelity audit passed");
