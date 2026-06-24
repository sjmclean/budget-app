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

function entries(): Ynab4PackageEntry[] {
  return [
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
        payees: [],
        transactions: [],
        scheduledTransactions: [],
        monthlyBudgets: [{
          month: "2025-04",
          monthlySubCategoryBudgets: [{
            categoryId: "category-1",
            budgeted: 3642980,
            activity: 0,
            balance: 0,
          }],
        }],
      }),
    },
  ];
}

const storage = new MemoryStorage();
storage.setItem("budget-app.budgets.my-budget.budget-app.accounts.v1", JSON.stringify([
  { id: "account-1", name: "Cheque" },
]));
storage.setItem("budget-app.budgets.my-budget.budget-app.account-registers.v1", JSON.stringify({}));
storage.setItem("budget-app.budgets.my-budget.budget-app.scheduled-transactions.v1", JSON.stringify([]));
storage.setItem("budget-app.budget-view.v1.my-budget.2025-04", JSON.stringify({
  totalAssigned: 3642.97,
  totalActivity: 0,
  totalAvailable: 3642.97,
}));

const audit = auditYnab4LauncherImportAccuracy(storage, {
  budgetId: "my-budget",
  entries: entries(),
});

assert.equal(audit.status, "pass");
assert.deepEqual(audit.mismatches, []);
assert.equal(
  audit.warnings.some((warning) => warning.includes("available differs")),
  true,
);

console.log("v1.72.2 YNAB4 budget rounding tolerance tests passed");
