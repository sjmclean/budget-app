import assert from "node:assert/strict";
import {
  auditYnab4LauncherImportAccuracy,
} from "../apps/web/src/features/budget/ynab4LauncherImportAccuracyAudit.ts";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";
import type { Ynab4PackageEntry } from "../packages/ynab4-importer/src/analyzeYnab4Package.ts";

class MemoryStorage implements KeyValueStoragePort {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  listKeys(): string[] {
    return [...this.values.keys()].sort();
  }
}

const budgetId = "available-warning-budget";
const storage = new MemoryStorage();

const entries: Ynab4PackageEntry[] = [
  {
    path: "My Budget.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data1~ABC" }),
  },
  {
    path: "My Budget.ynab4/data1~ABC/Budget.yfull",
    text: JSON.stringify({
      accounts: [{ entityId: "account-1", name: "Cheque", accountType: "Checking", onBudget: true }],
      masterCategories: [{
        entityId: "group-1",
        name: "Everyday",
        subCategories: [{ entityId: "category-1", name: "Groceries" }],
      }],
      payees: [{ entityId: "payee-1", name: "Supermarket" }],
      transactions: [{
        entityId: "transaction-1",
        accountId: "account-1",
        payeeId: "payee-1",
        categoryId: "category-1",
        date: "2020-12-01",
        amount: -1000,
        cleared: true,
      }],
      scheduledTransactions: [],
      monthlyBudgets: [{
        month: "2020-12",
        monthlySubCategoryBudgets: [{
          categoryId: "category-1",
          budgeted: 100000,
          activity: -1000,
          balance: 0,
        }],
      }],
    }),
  },
];

storage.setItem(`budget-app.budgets.${budgetId}.budget-app.accounts.v1`, JSON.stringify([
  { id: "account-1", name: "Cheque", type: "checking" },
]));

storage.setItem(`budget-app.budgets.${budgetId}.budget-app.account-registers.v1`, JSON.stringify({
  "account-1": {
    accountId: "account-1",
    accountName: "Cheque",
    transactions: [{ id: "transaction-1", amount: -1, date: "2020-12-01" }],
  },
}));

storage.setItem(`budget-app.budgets.${budgetId}.budget-app.scheduled-transactions.v1`, JSON.stringify([]));

storage.setItem(`budget-app.budget-view.v1.${budgetId}.2020-12`, JSON.stringify({
  month: "2020-12",
  totalAssigned: 100,
  totalActivity: -1,
  totalAvailable: 99,
  groups: [],
}));

const audit = auditYnab4LauncherImportAccuracy(storage, { entries, budgetId });

assert.equal(audit.status, "pass");
assert.deepEqual(audit.mismatches, []);
assert.ok(
  audit.warnings.some((warning) => warning.includes("Budget month 2020-12 available differs")),
);

console.log("v1.72.1 YNAB4 monthly available audit warning tests passed");
