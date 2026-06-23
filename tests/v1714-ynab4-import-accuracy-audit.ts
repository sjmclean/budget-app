import assert from "node:assert/strict";
import { getBudgetScopedStorageKey } from "../apps/web/src/features/budget/budgetDataScope.ts";
import {
  createYnab4LauncherBudgetImport,
} from "../apps/web/src/features/budget/ynab4LauncherImport.ts";
import {
  auditYnab4LauncherImportAccuracy,
} from "../apps/web/src/features/budget/ynab4LauncherImportAccuracyAudit.ts";
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
    path: "Family Budget.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data1" }),
  },
  {
    path: "Family Budget.ynab4/data1/Budget.yfull",
    text: JSON.stringify({
      accounts: [
        { accountId: "checking", name: "Cheque", accountType: "Checking" },
        { accountId: "closed-savings", name: "Closed Savings", accountType: "Savings", closed: true },
      ],
      masterCategories: [
        {
          masterCategoryId: "everyday",
          name: "Everyday",
          subCategories: [
            { entityId: "groceries", name: "Groceries" },
            { entityId: "rent", name: "Rent" },
          ],
        },
      ],
      payees: [{ entityId: "shop", name: "Shop" }],
      monthlyBudgets: [
        {
          entityId: "mb1",
          month: "2026-06",
          monthlySubCategoryBudgets: [
            { categoryId: "groceries", budgeted: 100000, activity: -25000, balance: 75000 },
            { categoryId: "rent", budgeted: 1200000, activity: -1200000, balance: 0 },
          ],
        },
      ],
      transactions: [
        { entityId: "t-open", accountId: "checking", payeeId: "shop", categoryId: "groceries", amount: -25000, date: "2026-06-03" },
        { entityId: "t-closed", accountId: "closed-savings", payeeId: "shop", amount: 50000, date: "2026-06-04" },
      ],
      scheduledTransactions: [
        { entityId: "s1", accountId: "checking", payeeId: "shop", categoryId: "rent", amount: -1200000 },
      ],
    }),
  },
];

function importFixture(storage: KeyValueStoragePort) {
  const discovery = discoverYnab4Package(entries);
  const preview = createYnab4PackageMigrationPreview(discovery, "new-budget");
  assert.equal(preview.canContinue, true);
  return createYnab4LauncherBudgetImport(storage, {
    discovery,
    preview,
    entries,
    now: new Date("2026-06-24T10:00:00.000Z"),
  });
}

function testAccuracyAuditPassesWhenPersistedDataMatchesSource() {
  const storage = createMemoryStorage();
  const result = importFixture(storage);

  const audit = auditYnab4LauncherImportAccuracy(storage, {
    entries,
    budgetId: result.budget.id,
  });

  assert.equal(audit.status, "pass");
  assert.deepEqual(audit.mismatches, []);
  assert.equal(audit.source.closedAccountTransactions, 1);
  assert.equal(audit.imported.closedAccountTransactions, 1);
  assert.equal(audit.source.transactions, 2);
  assert.equal(audit.imported.transactions, 2);
  assert.equal(audit.source.budgetMonthTotals["2026-06"].assigned, 1300);
  assert.equal(audit.imported.budgetMonthTotals["2026-06"].assigned, 1300);
}

function testAccuracyAuditDetectsMissingClosedAccountTransactionsAndWrongBudgetData() {
  const storage = createMemoryStorage();
  const result = importFixture(storage);
  const registersKey = getBudgetScopedStorageKey(result.budget.id, "budget-app.account-registers.v1");
  const registers = JSON.parse(storage.getItem(registersKey) ?? "{}");
  registers["closed-savings"].transactions = [];
  storage.setItem(registersKey, JSON.stringify(registers));

  const budgetViewKey = `budget-app.budget-view.v1.${result.budget.id}.2026-06`;
  const budgetView = JSON.parse(storage.getItem(budgetViewKey) ?? "{}");
  budgetView.totalAssigned = 42;
  storage.setItem(budgetViewKey, JSON.stringify(budgetView));

  const audit = auditYnab4LauncherImportAccuracy(storage, {
    entries,
    budgetId: result.budget.id,
  });

  assert.equal(audit.status, "fail");
  assert.equal(audit.source.closedAccountTransactions, 1);
  assert.equal(audit.imported.closedAccountTransactions, 0);
  assert.equal(audit.mismatches.some((mismatch) => mismatch.includes("closed-account transactions mismatch")), true);
  assert.equal(audit.mismatches.some((mismatch) => mismatch.includes("Account transaction count mismatch for Closed Savings")), true);
  assert.equal(audit.mismatches.some((mismatch) => mismatch.includes("budget month 2026-06 assigned mismatch")), true);
  assert.equal(audit.warnings.some((warning) => warning.includes("Closed YNAB4 accounts")), true);
}

function run() {
  testAccuracyAuditPassesWhenPersistedDataMatchesSource();
  testAccuracyAuditDetectsMissingClosedAccountTransactionsAndWrongBudgetData();
  console.log("v1.71.4 YNAB4 import accuracy audit tests passed");
}

run();
