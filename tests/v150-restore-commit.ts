import { purgeAllTransactionEntities } from "../apps/web/src/features/accounts/entities/transactionEntityPersistence.js";
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
  createFixedBudgetScopedStorage,
  getBudgetScopedStorageKey,
  SELECTED_BUDGET_STORAGE_KEY,
} from "../apps/web/src/features/budget/budgetDataScope";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort";
import { createCategoryEntityRepository, createCategoryGroupEntityRepository, syncCategoryEntities } from "../apps/web/src/features/budget/categoryEntities";
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
  syncCategoryEntities(createBudgetScopedStorage(rootStorage), {
    budgetId,
    budgetName: budgetId,
    monthLabel: "June 2026",
    currencyCode: "AUD",
    readyToAssign: 0,
    totalAssigned: 25,
    totalActivity: -25,
    totalAvailable: 0,
    categoryGroups: [{
      id: `${budgetId}-living`,
      name: `${accountName} Categories`,
      note: "",
      previousAvailable: 0,
      assigned: 25,
      activity: -25,
      available: 0,
      categories: [{
        id: `${budgetId}-groceries`,
        name: "Groceries",
        previousAvailable: 0,
        assigned: 25,
        activity: -25,
        available: 0,
        isOverspent: false,
        isArchived: false,
        overspendingHandling: "reduce-next-month",
        note: `${payee} category`,
      }],
    }],
  }, new Date("2026-06-22T01:30:00.000Z"));
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
  "budget-app.entity-replication.v1/account-index",
);
rootStorage.removeItem(businessAccountKey);
purgeAllTransactionEntities(createFixedBudgetScopedStorage(rootStorage, sideBudget.id));
rootStorage.removeItem(
  getBudgetScopedStorageKey(sideBudget.id, "budget-app.payees.v1"),
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
  0,
  "current packages keep global diagnostics out of restorable records",
);
assert.deepEqual(result.errors, []);
assert.ok(rootStorage.getItem(getBudgetScopedStorageKey(sideBudget.id, "budget-app.entity-replication.v1/category-group-index")));
assert.ok(rootStorage.getItem(getBudgetScopedStorageKey(sideBudget.id, "budget-app.entity-replication.v1/category-index")));
rootStorage.setItem(SELECTED_BUDGET_STORAGE_KEY, sideBudget.id);
const restoredCategoryStorage = createBudgetScopedStorage(rootStorage);
assert.equal(createCategoryGroupEntityRepository(restoredCategoryStorage).list()[0]?.fields.name.value, "Business Cheque Categories");
assert.equal(createCategoryEntityRepository(restoredCategoryStorage).list()[0]?.fields.note.value, "Client Pty Ltd category");

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


const legacyPackage = JSON.parse(backupRaw);
legacyPackage.schema = "budget-app.data-export.v1";
legacyPackage.records.push({
  key: "budget-app.settings.v1",
  value: JSON.stringify({ marker: "legacy global should be skipped" }),
  scope: "global",
  description: "Legacy settings snapshot",
});
const legacyResult = restoreBudgetDataPackage(
  rootStorage,
  JSON.stringify(legacyPackage),
);
assert.equal(legacyResult.restored, true);
assert.equal(legacyResult.skippedGlobalRecords, 1);
assert.ok(
  legacyResult.warnings.some((warning) => warning.includes("legacy v1.49/v1.50")),
  "legacy schema should restore with an explicit compatibility warning",
);
assert.equal(
  rootStorage.getItem(SETTINGS_STORAGE_KEY),
  JSON.stringify({ marker: "current settings should survive restore" }),
);

const invalidResult = restoreBudgetDataPackage(rootStorage, "not json");
assert.equal(invalidResult.restored, false);
assert.ok(invalidResult.errors.includes("File is not valid JSON."));

console.log("v1.50 restore commit checks passed");
