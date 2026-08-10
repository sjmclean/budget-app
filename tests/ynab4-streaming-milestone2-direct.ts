import assert from "node:assert/strict";
import { createYnab4SourceReader } from "../packages/ynab4-importer/src/source/index.js";
import {
  buildYnab4LauncherImportPlan,
  importYnab4ReaderToStage,
  writeYnab4LauncherImportPlan,
} from "../apps/web/src/features/budget/ynab4LauncherImport.js";
import { createFixedBudgetScopedStorage } from "../apps/web/src/features/budget/budgetDataScope.js";
import { readTransactionRegisters } from "../apps/web/src/features/accounts/entities/transactionEntityPersistence.js";
import { DEFAULT_BUDGET_PREFERENCES } from "../apps/web/src/features/budget/budgetPreferences.js";
import type { BudgetSummary } from "../apps/web/src/features/budget/budgetRegistry.js";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.js";

class MemoryStorage implements KeyValueStoragePort {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  listKeys() { return [...this.values.keys()]; }
  async flush() {}
}

const data = {
  accounts: [
    { entityId: "checking", name: "Checking", accountType: "Checking", onBudget: true },
    { entityId: "savings", name: "Savings", accountType: "Savings", onBudget: true },
  ],
  masterCategories: [{
    entityId: "living", name: "Living", type: "OUTFLOW",
    subCategories: [
      { entityId: "food", name: "Food", sortableIndex: 0 },
      { entityId: "rent", name: "Rent", sortableIndex: 1 },
    ],
  }],
  payees: [{ entityId: "shop", name: "Café" }],
  monthlyBudgets: [],
  transactions: [
    { entityId: "food-1", accountId: "checking", categoryId: "food", payeeId: "shop", date: "2026-07-01", amount: -25.5, cleared: "cleared" },
    { entityId: "split-1", accountId: "checking", categoryId: "Category/__Split__", date: "2026-07-02", amount: -30, subTransactions: [
      { entityId: "split-food", categoryId: "food", amount: -10 },
      { entityId: "split-rent", categoryId: "rent", amount: -20 },
    ] },
    { entityId: "transfer-out", accountId: "checking", targetAccountId: "savings", date: "2026-07-03", amount: -100, transferTransactionId: "transfer-in" },
    { entityId: "transfer-in", accountId: "savings", targetAccountId: "checking", date: "2026-07-03", amount: 100, transferTransactionId: "transfer-out" },
    { entityId: "deleted", accountId: "checking", date: "2026-07-04", amount: -999, isTombstone: true },
  ],
  scheduledTransactions: [{
    entityId: "scheduled-rent", accountId: "checking", categoryId: "rent",
    nextDueDate: "2026-08-01", amount: -1000, frequency: "Monthly",
  }],
};

const now = new Date("2026-07-27T00:00:00.000Z");
const budget: BudgetSummary = {
  id: "direct-stage-budget", name: "Direct stage", currency: "AUD",
  preferences: { ...DEFAULT_BUDGET_PREFERENCES }, lastOpenedLabel: "Never",
  packagePath: "direct.budget", createdAt: now.toISOString(), updatedAt: now.toISOString(),
};
const source = JSON.stringify(data);
const legacy = buildYnab4LauncherImportPlan(budget, JSON.parse(source), now);
const legacyStorage = new MemoryStorage();
writeYnab4LauncherImportPlan(legacyStorage, legacy);
const expectedPersisted = readTransactionRegisters(
  createFixedBudgetScopedStorage(legacyStorage, budget.id),
);

for (const batchSize of [1, 2, 500]) {
  const storage = new MemoryStorage();
  const progress: string[] = [];
  const result = await importYnab4ReaderToStage(
    storage, createYnab4SourceReader(source, { chunkSize: 5 }), budget, now,
    {
      id: `direct-${batchSize}`,
      batchSize,
      onProgress: (event) => progress.push(event.phase),
    },
  );
  assert.equal(result.transactionCount, 4);
  assert.equal(result.scheduledTransactionCount, 1);
  assert.equal(result.audit.status, "pass");
  assert.equal(result.audit.transactions, 4);
  assert.ok(result.maximumCanonicalBatchRecords <= batchSize);
  assert.ok(progress.includes("transactions"));
  assert.equal(progress.at(-1), "committing");
  assert.equal(storage.listKeys().some((key) => key.startsWith("budget-app.import-stage.")), false);
  const persisted = readTransactionRegisters(createFixedBudgetScopedStorage(storage, budget.id));
  for (const [accountId, expected] of Object.entries(expectedPersisted)) {
    assert.deepEqual(persisted[accountId]?.transactions, expected.transactions);
    assert.equal(persisted[accountId]?.workingBalance, expected.workingBalance);
    assert.equal(persisted[accountId]?.clearedBalance, expected.clearedBalance);
  }
}

{
  const storage = new MemoryStorage();
  const invalid = JSON.stringify({ ...data, transactions: [{
    entityId: "invalid", accountId: "missing", categoryId: "food",
    date: "2026-07-01", amount: -1,
  }] });
  await assert.rejects(
    importYnab4ReaderToStage(
      storage, createYnab4SourceReader(invalid, { chunkSize: 3 }), budget, now,
      { id: "direct-failure", batchSize: 1 },
    ),
    /unresolved account reference/i,
  );
  assert.deepEqual(storage.listKeys(), []);
}

console.log("Milestone 2 direct staged-entity tests passed");
