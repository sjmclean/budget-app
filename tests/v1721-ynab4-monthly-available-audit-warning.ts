import { seedTransactionRegisters } from "./helpers/transactionEntityFixtures.js";
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
        amount: -1,
        cleared: true,
      }],
      scheduledTransactions: [],
      monthlyBudgets: [{
        month: "2020-12",
        monthlySubCategoryBudgets: [{
          categoryId: "category-1",
          budgeted: 100,
          activity: -1,
          balance: 0,
        }],
      }],
    }),
  },
];

replaceAccountEntities(createFixedBudgetScopedStorage(storage, budgetId), [{
  id: "account-1",
  name: "Cheque",
  type: "on-budget",
  startingBalance: 0,
  createdAt: "2020-12-01T00:00:00.000Z",
  closedAt: null,
}], new Date("2020-12-01T00:00:00.000Z"));

seedTransactionRegisters(createFixedBudgetScopedStorage(storage, budgetId), {
  "account-1": {
    accountId: "account-1",
    accountName: "Cheque",
    transactions: [{ id: "transaction-1", date: "2020-12-01", payee: "Shop", category: "Groceries", inflow: 0, outflow: 1 }],
  },
});


writeBudgetMonthEntity(storage, budgetId, "2020-12", {
  budgetId,
  month: "2020-12",
  totalAssigned: 100,
  totalActivity: -1,
  totalAvailable: 99,
  categoryGroups: [{ id: "group-1", name: "Everyday", previousAvailable: 0, assigned: 100, activity: -1, available: 99, note: "", categories: [{ id: "category-1", name: "Groceries", previousAvailable: 0, assigned: 100, activity: -1, available: 99, note: "", isArchived: false }] }],
});

const audit = auditYnab4LauncherImportAccuracy(storage, { entries, budgetId });

assert.equal(audit.status, "pass");
assert.deepEqual(audit.mismatches, []);
assert.ok(
  audit.warnings.some((warning) => warning.includes("Budget month 2020-12 available differs")),
);

console.log("v1.72.1 YNAB4 monthly available audit warning tests passed");
