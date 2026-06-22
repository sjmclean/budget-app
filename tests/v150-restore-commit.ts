import assert from "node:assert/strict";

import { createAccountRegisterService } from "../apps/web/src/features/accounts/accountRegisterService";
import {
  createAccountService,
  readAccounts,
} from "../apps/web/src/features/accounts/accountService";
import {
  createPayeeService,
  findPayeeIdByName,
} from "../apps/web/src/features/accounts/payeeService";
import { createScheduledTransactionService } from "../apps/web/src/features/accounts/scheduledTransactionService";
import {
  createBudgetDataExportPackage,
  restoreBudgetDataPackage,
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
import { SETTINGS_STORAGE_KEY } from "../apps/web/src/features/settings/settingsPreferences";

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
    getAccountById: (accountId) =>
      accounts.getAccountById(accountId) ?? undefined,
  });
  const scheduled = createScheduledTransactionService({
    storage,
    recordPayee: async (payeeName) => {
      await payees.recordPayee(payeeName);
    },
    findPayeeIdByName: (payeeName) => findPayeeIdByName(storage, payeeName),
  });

  return { accounts, payees, registers, scheduled };
}

async function seedBudget(
  rootStorage: KeyValueStoragePort,
  budgetId: string,
  accountName: string,
  payee: string,
) {
  rootStorage.setItem(SELECTED_BUDGET_STORAGE_KEY, budgetId);
  const services = createServices(rootStorage);
  const accounts = await services.accounts.createAccount({
    name: accountName,
    type: "on-budget",
    startingBalance: 100,
  });
  const account = accounts[0];
  assert.ok(account);

  await services.registers.addTransaction({
    accountId: account.id,
    transaction: {
      date: "2026-06-22",
      flag: null,
      payee,
      category: "Groceries",
      memo: `${payee} transaction`,
      outflow: 25,
      inflow: 0,
    },
  });

  await services.scheduled.create({
    accountId: account.id,
    flag: null,
    nextDueDate: "2026-07-01",
    frequency: "monthly",
    payee: `${payee} Scheduled`,
    category: "Bills",
    memo: `${payee} scheduled transaction`,
    outflow: 10,
    inflow: 0,
  });

  rootStorage.setItem(
    `budget-app.budget-view.v1.${budgetId}.2026-06`,
    JSON.stringify({ budgetId, payee }),
  );
}

const rootStorage = new MemoryStorage();
writeBudgetRegistry(
  rootStorage,
  createInitialBudgetRegistry(new Date("2026-06-22T00:00:00.000Z")),
);
const sideBudget = createBudgetRegistryEntry(rootStorage, {
  name: "Side Business",
  now: new Date("2026-06-22T01:00:00.000Z"),
});

rootStorage.setItem(
  SETTINGS_STORAGE_KEY,
  JSON.stringify({ marker: "current settings should survive restore" }),
);

await seedBudget(
  rootStorage,
  "household",
  "Household Everyday",
  "Household Payee",
);
await seedBudget(
  rootStorage,
  sideBudget.id,
  "Business Cheque",
  "Client Pty Ltd",
);

rootStorage.setItem(SELECTED_BUDGET_STORAGE_KEY, sideBudget.id);
const backupPackage = createBudgetDataExportPackage(
  rootStorage,
  "backup",
  new Date("2026-06-22T02:00:00.000Z"),
);
const backupRaw = serialiseBudgetDataPackage(backupPackage);

// Replace the active budget with unrelated data, then restore the backup into
// the same selected budget. Restore must clear stale active-budget data first.
const businessAccountKey = getBudgetScopedStorageKey(
  sideBudget.id,
  "budget-app.accounts.v1",
);
rootStorage.removeItem(businessAccountKey);
rootStorage.removeItem(
  getBudgetScopedStorageKey(sideBudget.id, "budget-app.account-registers.v1"),
);
rootStorage.removeItem(
  getBudgetScopedStorageKey(sideBudget.id, "budget-app.payees.v1"),
);
rootStorage.removeItem(
  getBudgetScopedStorageKey(
    sideBudget.id,
    "budget-app.scheduled-transactions.v1",
  ),
);
await seedBudget(rootStorage, sideBudget.id, "Wrong Account", "Wrong Payee");

const result = restoreBudgetDataPackage(rootStorage, backupRaw);
assert.equal(result.restored, true);
assert.equal(result.targetBudgetId, sideBudget.id);
assert.equal(result.sourceBudgetId, sideBudget.id);
assert.ok(
  result.writtenRecords >= 5,
  "restore should write active budget records",
);
assert.equal(
  result.skippedGlobalRecords,
  2,
  "settings and registry snapshots should not be restored",
);
assert.deepEqual(result.errors, []);

rootStorage.setItem(SELECTED_BUDGET_STORAGE_KEY, sideBudget.id);
const restoredServices = createServices(rootStorage);
const restoredAccounts = await restoredServices.accounts.listAccounts();
assert.equal(restoredAccounts.length, 1);
assert.equal(restoredAccounts[0]?.name, "Business Cheque");
assert.ok(restoredAccounts[0]);
const restoredRegister =
  await restoredServices.registers.getAccountRegisterView({
    accountId: restoredAccounts[0].id,
  });
assert.ok(
  restoredRegister.transactions.some(
    (transaction) => transaction.memo === "Client Pty Ltd transaction",
  ),
  "restore should bring back package transactions",
);
assert.ok(
  !restoredRegister.transactions.some(
    (transaction) => transaction.memo === "Wrong Payee transaction",
  ),
  "restore should remove stale current-budget transactions before writing backup records",
);

rootStorage.setItem(SELECTED_BUDGET_STORAGE_KEY, "household");
const householdServices = createServices(rootStorage);
const householdAccounts = await householdServices.accounts.listAccounts();
assert.equal(
  householdAccounts[0]?.name,
  "Household Everyday",
  "restore must not overwrite another budget",
);
assert.equal(
  rootStorage.getItem(SETTINGS_STORAGE_KEY),
  JSON.stringify({ marker: "current settings should survive restore" }),
);

const maliciousPackage = JSON.parse(backupRaw);
maliciousPackage.records.push({
  key: "budget-app.budget-registry.v1",
  value: JSON.stringify([{ id: "evil", name: "Evil" }]),
  scope: "budget",
  description: "Malicious registry overwrite attempt",
});
const maliciousResult = restoreBudgetDataPackage(
  rootStorage,
  JSON.stringify(maliciousPackage),
);
assert.equal(
  maliciousResult.restored,
  true,
  "unsupported budget records should be skipped, not committed as arbitrary keys",
);
assert.ok(
  maliciousResult.warnings.some((warning) =>
    warning.includes("Skipped unsupported budget record key"),
  ),
  "restore should warn when unsupported keys are skipped",
);
assert.equal(
  rootStorage.getItem("budget-app.budget-registry.v1")?.includes("evil"),
  false,
);

const invalidResult = restoreBudgetDataPackage(rootStorage, "not json");
assert.equal(invalidResult.restored, false);
assert.ok(invalidResult.errors.includes("File is not valid JSON."));

console.log("v1.50 restore commit checks passed");
