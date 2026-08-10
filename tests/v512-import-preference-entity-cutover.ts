import assert from "node:assert/strict";
import { installInMemoryBudgetPersistence } from "./support/persistence/inMemoryBudgetPersistence.js";
import { writeBudgetRegistry } from "../apps/web/src/features/budget/budgetRegistry";
import { SELECTED_BUDGET_STORAGE_KEY } from "../apps/web/src/features/budget/budgetDataScope";
import {
  createTransactionImportProfileEntityRepository,
  createTransactionPayeeAliasEntityRepository,
  TRANSACTION_IMPORT_PROFILE_ENTITY_INDEX_KEY,
  TRANSACTION_PAYEE_ALIAS_ENTITY_INDEX_KEY,
} from "../apps/web/src/features/accounts/entities/importPreferenceEntity";
import {
  createTransactionImportProfile,
  createTransactionPayeeAlias,
  readTransactionImportProfiles,
  readTransactionPayeeAliases,
  writeTransactionImportProfiles,
  writeTransactionPayeeAliases,
} from "../apps/web/src/features/accounts/transactionImport";

const { storage, cleanup } = installInMemoryBudgetPersistence();
try {
  const createdAt = "2026-07-27T00:00:00.000Z";
  writeBudgetRegistry(storage, [
    { id: "budget-a", name: "Budget A", createdAt, updatedAt: createdAt },
    { id: "budget-b", name: "Budget B", createdAt, updatedAt: createdAt },
  ]);
  storage.setItem(SELECTED_BUDGET_STORAGE_KEY, "budget-a");

  const alias = createTransactionPayeeAlias({ sourcePayee: "WOOLWORTHS 1234", targetPayee: "Woolworths" });
  writeTransactionPayeeAliases([alias]);
  assert.deepEqual(readTransactionPayeeAliases(), [alias]);
  assert.equal(storage.getItem("budget-app.transaction-payee-aliases.v1"), null);
  assert.ok(storage.listKeys().some((key) => key.endsWith(TRANSACTION_PAYEE_ALIAS_ENTITY_INDEX_KEY)));

  const analysis = {
    columns: [
      { index: 0, header: "Date", normalisedHeader: "date", sampleValues: ["2026-07-01"] },
      { index: 1, header: "Amount", normalisedHeader: "amount", sampleValues: ["-12.00"] },
    ],
    rowCount: 1,
  };
  const profile = createTransactionImportProfile({
    name: "Bank CSV",
    analysis,
    mapping: { dateColumn: 0, amountColumn: 1 },
    defaultAccountName: "Everyday",
  });
  writeTransactionImportProfiles([profile]);
  assert.deepEqual(readTransactionImportProfiles(), [profile]);
  assert.equal(storage.getItem("budget-app.transaction-import-profiles.v1"), null);
  assert.ok(storage.listKeys().some((key) => key.endsWith(TRANSACTION_IMPORT_PROFILE_ENTITY_INDEX_KEY)));

  const scoped = (budgetId: string) => ({
    getItem: (key: string) => storage.getItem(`budget-app.budgets.${budgetId}.${key}`),
    setItem: (key: string, value: string) => storage.setItem(`budget-app.budgets.${budgetId}.${key}`, value),
    removeItem: (key: string) => storage.removeItem(`budget-app.budgets.${budgetId}.${key}`),
    listKeys: () => storage.listKeys()
      .filter((key) => key.startsWith(`budget-app.budgets.${budgetId}.`))
      .map((key) => key.slice(`budget-app.budgets.${budgetId}.`.length)),
  });

  const aliasRepository = createTransactionPayeeAliasEntityRepository(scoped("budget-a"));
  const before = aliasRepository.get(alias.id);
  assert.ok(before);
  writeTransactionPayeeAliases([{ ...alias, targetPayee: "Woolworths Metro", updatedAt: "2026-07-27T01:00:00.000Z" }]);
  const after = aliasRepository.get(alias.id);
  assert.ok(after);
  assert.equal(JSON.stringify(after.fields.sourcePayee.timestamp), JSON.stringify(before.fields.sourcePayee.timestamp));
  assert.notEqual(JSON.stringify(after.fields.targetPayee.timestamp), JSON.stringify(before.fields.targetPayee.timestamp));

  writeTransactionPayeeAliases([]);
  assert.equal(readTransactionPayeeAliases().length, 0);
  assert.equal(aliasRepository.list({ includeTombstoned: true })[0]?.metadata.tombstone === null, false);

  storage.setItem(SELECTED_BUDGET_STORAGE_KEY, "budget-b");
  assert.deepEqual(readTransactionImportProfiles(), []);
  assert.deepEqual(readTransactionPayeeAliases(), []);
  const otherAlias = createTransactionPayeeAlias({ sourcePayee: "ALDI 9988", targetPayee: "Aldi" });
  writeTransactionPayeeAliases([otherAlias]);
  assert.deepEqual(readTransactionPayeeAliases(), [otherAlias]);

  storage.setItem(SELECTED_BUDGET_STORAGE_KEY, "budget-a");
  assert.deepEqual(readTransactionImportProfiles(), [profile]);
  assert.deepEqual(readTransactionPayeeAliases(), []);

  const profileRepository = createTransactionImportProfileEntityRepository(scoped("budget-a"));
  assert.equal(profileRepository.list().length, 1);

  console.log("v5.12 import preference entity cutover checks passed");
} finally {
  cleanup();
}
