import assert from "node:assert/strict";
import { createScheduledTransactionEntityHarness } from "./support/scheduledTransactionEntityHarness.ts";

import { createAccountRegisterService } from "../apps/web/src/features/accounts/accountRegisterService";
import { createAccountService, readAccounts } from "../apps/web/src/features/accounts/accountService";
import { createPayeeService, findPayeeIdByName } from "../apps/web/src/features/accounts/payeeService";
import {
  BUDGET_DATA_EXPORT_SCHEMA,
  createBudgetDataExportPackage,
  createBudgetDataFilename,
  previewBudgetDataRestore,
  serialiseBudgetDataPackage,
} from "../apps/web/src/features/budget/budgetDataExport";
import {
  createBudgetRegistryEntry,
  createInitialBudgetRegistry,
  writeBudgetRegistry,
} from "../apps/web/src/features/budget/budgetRegistry";
import {
  createBudgetScopedStorage,
  getBudgetScopedStorageKey,
  SELECTED_BUDGET_STORAGE_KEY,
} from "../apps/web/src/features/budget/budgetDataScope";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort";
import { syncCategoryEntities } from "../apps/web/src/features/budget/categoryEntities";

class MemoryStorage implements KeyValueStoragePort {
  private values = new Map<string, string>();

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
    return Array.from(this.values.keys()).sort();
  }
}

function createServices(rootStorage: KeyValueStoragePort) {
  const storage = createBudgetScopedStorage(rootStorage);
  const accounts = createAccountService({ storage });
  const payees = createPayeeService({ storage });
  const registers = createAccountRegisterService({
    storage,
    recordPayee: async (payeeName) => {
      await payees.recordPayee(payeeName);
    },
    findPayeeIdByName: (payeeName) => findPayeeIdByName(storage, payeeName),
    readAccounts: () => readAccounts(storage),
    getAccountById: (accountId) => accounts.getAccountById(accountId) ?? undefined,
  });
  const scheduled =
    createScheduledTransactionEntityHarness(storage);

  return { accounts, payees, registers, scheduled };
}

const rootStorage = new MemoryStorage();
writeBudgetRegistry(rootStorage, createInitialBudgetRegistry(new Date("2026-06-22T00:00:00.000Z")));
const sideBudget = createBudgetRegistryEntry(rootStorage, {
  name: "Side Business",
  now: new Date("2026-06-22T01:00:00.000Z"),
});
const services = createServices(rootStorage);

rootStorage.setItem(SELECTED_BUDGET_STORAGE_KEY, "household");
const householdAccounts = await services.accounts.createAccount({
  name: "Everyday",
  type: "on-budget",
  startingBalance: 1000,
});
assert.ok(householdAccounts[0]);
await services.registers.addTransaction({
  accountId: householdAccounts[0].id,
  transaction: {
    date: "2026-06-22",
    flag: null,
    payee: "Grocer",
    category: "Groceries",
    memo: "Household transaction",
    outflow: 50,
    inflow: 0,
  },
});

rootStorage.setItem(SELECTED_BUDGET_STORAGE_KEY, sideBudget.id);
const sideAccounts = await services.accounts.createAccount({
  name: "Business Cheque",
  type: "on-budget",
  startingBalance: 250,
});
assert.ok(sideAccounts[0]);
await services.registers.addTransaction({
  accountId: sideAccounts[0].id,
  transaction: {
    date: "2026-06-23",
    flag: null,
    payee: "Client Pty Ltd",
    category: "Ready to Assign",
    memo: "Side-budget transaction",
    outflow: 0,
    inflow: 500,
  },
});
await services.scheduled.create({
  accountId: sideAccounts[0].id,
  flag: null,
  nextDueDate: "2026-07-01",
  frequency: "monthly",
  payee: "Software Vendor",
  category: "Software",
  memo: "Business subscription",
  outflow: 30,
  inflow: 0,
});
rootStorage.setItem(`budget-app.budget-view.v1.${sideBudget.id}.2026-06`, JSON.stringify({ marker: "side month" }));
syncCategoryEntities(createBudgetScopedStorage(rootStorage), {
  budgetId: sideBudget.id,
  budgetName: "Side Business",
  monthLabel: "June 2026",
  currencyCode: "AUD",
  readyToAssign: 0,
  totalAssigned: 30,
  totalActivity: 0,
  totalAvailable: 30,
  categoryGroups: [{
    id: "business-costs",
    name: "Business Costs",
    note: "",
    previousAvailable: 0,
    assigned: 30,
    activity: 0,
    available: 30,
    categories: [{
      id: "software",
      name: "Software",
      previousAvailable: 0,
      assigned: 30,
      activity: 0,
      available: 30,
      isOverspent: false,
      isArchived: false,
      overspendingHandling: "reduce-next-month",
      note: "",
    }],
  }],
}, new Date("2026-06-22T01:30:00.000Z"));

const exportPackage = createBudgetDataExportPackage(
  rootStorage,
  "backup",
  new Date("2026-06-22T02:00:00.000Z"),
);

assert.equal(exportPackage.schema, BUDGET_DATA_EXPORT_SCHEMA);
assert.equal(exportPackage.kind, "backup");
assert.equal(exportPackage.budget.id, sideBudget.id);
assert.equal(exportPackage.counts.accounts, 1);
assert.equal(exportPackage.counts.accountRegisters, 1);
assert.equal(exportPackage.counts.transactions, 2, "opening balance plus entered transaction should be counted");
assert.equal(exportPackage.counts.scheduledTransactions, 1);
assert.equal(exportPackage.counts.budgetMonths, 1);
assert.ok(exportPackage.records.some((record) => record.key === getBudgetScopedStorageKey(sideBudget.id, "budget-app.entity-replication.v1/account-index")));
assert.ok(exportPackage.records.some((record) => record.key === getBudgetScopedStorageKey(sideBudget.id, "budget-app.entity-replication.v1/category-group-index")));
assert.ok(exportPackage.records.some((record) => record.key === getBudgetScopedStorageKey(sideBudget.id, "budget-app.entity-replication.v1/category-index")));
assert.ok(exportPackage.records.every((record) => record.scope === "budget"), "restorable records should be budget-scoped only");
assert.ok(exportPackage.diagnosticSnapshots.every((record) => record.scope === "global"), "global context should be isolated as diagnostics");
assert.ok(!serialiseBudgetDataPackage(exportPackage).includes("Household transaction"), "active budget export must not leak other budget transactions");
assert.match(createBudgetDataFilename(exportPackage), /^side-business-2026-06-22\.backup\.json$/);

const preview = previewBudgetDataRestore(serialiseBudgetDataPackage(exportPackage));
assert.equal(preview.valid, true);
assert.equal(preview.budgetId, sideBudget.id);
assert.equal(preview.counts?.accounts, 1);
assert.equal(preview.counts?.transactions, 2);
assert.deepEqual(preview.errors, []);
assert.ok(preview.warnings.every((warning) => !warning.includes("legacy")), "current schema should not warn as legacy");

const invalidPreview = previewBudgetDataRestore("not json");
assert.equal(invalidPreview.valid, false);
assert.ok(invalidPreview.errors.includes("File is not valid JSON."));

console.log("v1.49 data export and restore preview checks passed");
