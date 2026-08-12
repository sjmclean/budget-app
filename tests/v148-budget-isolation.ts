import assert from "node:assert/strict";
import { createScheduledTransactionEntityHarness } from "./support/scheduledTransactionEntityHarness.ts";
import { createAccountRegisterService } from "../apps/web/src/features/accounts/accountRegisterService";
import { createAccountService, readAccounts } from "../apps/web/src/features/accounts/accountService";
import { createPayeeService, findPayeeIdByName } from "../apps/web/src/features/accounts/payeeService";
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
    return [...this.values.keys()];
  }
}

function createBudgetScopedServices(rootStorage: KeyValueStoragePort) {
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
const services = createBudgetScopedServices(rootStorage);

rootStorage.setItem(SELECTED_BUDGET_STORAGE_KEY, "household");
const householdAccounts = await services.accounts.createAccount({
  name: "Everyday",
  type: "on-budget",
  startingBalance: 1000,
});
const householdAccount = householdAccounts[0];
assert.ok(householdAccount, "household account should be created");
await services.registers.addTransaction({
  accountId: householdAccount.id,
  transaction: {
    date: "2026-06-22",
    flag: null,
    payee: "Grocery Store",
    category: "Groceries",
    memo: "Household-only transaction",
    outflow: 42,
    inflow: 0,
  },
});
await services.scheduled.create({
  accountId: householdAccount.id,
  flag: null,
  nextDueDate: "2026-07-01",
  frequency: "monthly",
  payee: "Power Company",
  category: "Utilities",
  memo: "Household-only schedule",
  outflow: 120,
  inflow: 0,
});

rootStorage.setItem(SELECTED_BUDGET_STORAGE_KEY, sideBudget.id);
assert.deepEqual(await services.accounts.listAccounts(), [], "second budget should not inherit household accounts");
assert.deepEqual(await services.payees.listPayees(), [], "second budget should not inherit household payees");
assert.deepEqual(await services.scheduled.listByAccount(householdAccount.id), [], "second budget should not inherit household scheduled transactions");

const sideAccounts = await services.accounts.createAccount({
  name: "Business Cheque",
  type: "on-budget",
  startingBalance: 250,
});
const sideAccount = sideAccounts[0];
assert.ok(sideAccount, "side budget account should be created");
await services.registers.addTransaction({
  accountId: sideAccount.id,
  transaction: {
    date: "2026-06-22",
    flag: null,
    payee: "Client Pty Ltd",
    category: "Ready to Assign",
    memo: "Side-budget transaction",
    outflow: 0,
    inflow: 300,
  },
});

const sideRegister = await services.registers.getAccountRegisterView({ accountId: sideAccount.id });
assert.ok(sideRegister.transactions.some((transaction) => transaction.payee === "Client Pty Ltd"), "side budget should keep its own register data");

rootStorage.setItem(SELECTED_BUDGET_STORAGE_KEY, "household");
const restoredHouseholdAccounts = await services.accounts.listAccounts();
assert.equal(restoredHouseholdAccounts.length, 1, "household accounts should remain available after switching back");
assert.equal(restoredHouseholdAccounts[0]?.name, "Everyday");
const householdRegister = await services.registers.getAccountRegisterView({ accountId: householdAccount.id });
assert.ok(householdRegister.transactions.some((transaction) => transaction.payee === "Grocery Store"), "household register should remain isolated after switching back");
assert.equal(householdRegister.transactions.some((transaction) => transaction.payee === "Client Pty Ltd"), false, "household register should not contain side-budget transactions");
assert.equal((await services.scheduled.listByAccount(householdAccount.id)).length, 1, "household schedule should remain isolated");

assert.ok(
  rootStorage.getItem(getBudgetScopedStorageKey("household", "budget-app.entity-replication.v1/account-index")),
  "household accounts should be written under a budget-scoped key",
);
assert.ok(
  rootStorage.getItem(getBudgetScopedStorageKey(sideBudget.id, "budget-app.entity-replication.v1/account-index")),
  "second budget accounts should be written under a budget-scoped key",
);
assert.equal(rootStorage.getItem("budget-app.accounts.v1"), null, "account entities should not use the legacy account document key");

const legacyStorage = new MemoryStorage();
writeBudgetRegistry(legacyStorage, createInitialBudgetRegistry(new Date("2026-06-22T00:00:00.000Z")));
legacyStorage.setItem(SELECTED_BUDGET_STORAGE_KEY, "household");
legacyStorage.setItem("budget-app.payees.v1", JSON.stringify([
  {
    id: "legacy-payee",
    name: "Legacy Payee",
    createdAt: "2026-06-22T00:00:00.000Z",
    lastUsedAt: "2026-06-22T00:00:00.000Z",
    useCount: 1,
    isArchived: false,
  },
]));
const legacyServices = createBudgetScopedServices(legacyStorage);
assert.equal((await legacyServices.payees.listPayees()).length, 0, "the removed legacy payee document must not be read");
legacyStorage.setItem(SELECTED_BUDGET_STORAGE_KEY, "missing-budget");
assert.equal((await legacyServices.payees.listPayees()).length, 0, "fallback budget selection must still ignore the removed legacy payee document");

console.log("v1.48 budget isolation checks passed");
