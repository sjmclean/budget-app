import { replaceAccountEntities } from "../apps/web/src/features/accounts/entities/accountEntity.js";
import { createFixedBudgetScopedStorage } from "../apps/web/src/features/budget/budgetDataScope.js";
import { writeBudgetMonthEntity } from "../apps/web/src/features/budget/entities/budgetMonthEntity.js";
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
            budgeted: 3642.98,
            activity: 0,
            balance: 0,
          }],
        }],
      }),
    },
  ];
}

const storage = new MemoryStorage();
replaceAccountEntities(createFixedBudgetScopedStorage(storage, "my-budget"), [{
  id: "account-1",
  name: "Cheque",
  type: "on-budget",
  startingBalance: 0,
  createdAt: "2025-04-01T00:00:00.000Z",
  closedAt: null,
}], new Date("2025-04-01T00:00:00.000Z"));
writeBudgetMonthEntity(storage, "my-budget", "2025-04", {
  budgetId: "my-budget",
  month: "2025-04",
  categoryGroups: [{ id: "group-1", name: "Everyday", previousAvailable: 0, assigned: 3642.97, activity: 0, available: 3642.97, note: "", categories: [{ id: "category-1", name: "Groceries", previousAvailable: 0, assigned: 3642.97, activity: 0, available: 3642.97, note: "", isArchived: false }] }],
  totalAssigned: 3642.97,
  totalActivity: 0,
  totalAvailable: 3642.97,
});

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
