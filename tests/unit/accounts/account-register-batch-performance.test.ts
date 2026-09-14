import assert from "node:assert/strict";
import test from "node:test";

import {
  BrowserPersistentAccountRegisterService,
  type RegisterBatchCommitTimingEntry,
} from "../../../apps/web/src/features/accounts/accountRegisterService.js";
import { RegisterTransactionBatchCommitError } from "../../../apps/web/src/features/accounts/accountRegisterPersistencePort.js";
import type { SidebarAccount } from "../../../apps/web/src/features/accounts/accountService.js";

function fixture() {
  const values = new Map<string, string>();
  let failNextWrite = false;
  const operations = { gets: 0, sets: 0, removes: 0, payeeBatches: 0 };
  const accounts: SidebarAccount[] = [
    { id: "checking", name: "Checking", type: "on-budget", startingBalance: 0, createdAt: "2026-01-01" },
    { id: "savings", name: "Savings", type: "on-budget", startingBalance: 0, createdAt: "2026-01-01" },
  ];
  let observedTimings: readonly RegisterBatchCommitTimingEntry[] = [];
  const storage = {
    getItem(key: string) {
      operations.gets += 1;
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      operations.sets += 1;
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error("forced persistence failure");
      }
      values.set(key, value);
    },
    removeItem(key: string) {
      operations.removes += 1;
      values.delete(key);
    },
    listKeys: () => [...values.keys()],
  };
  const service = new BrowserPersistentAccountRegisterService({
    storage,
    recordPayee: async () => {},
    recordPayees: async () => { operations.payeeBatches += 1; },
    findPayeeIdByName: (name) => `payee:${name}`,
    readAccounts: () => accounts,
    getAccountById: (id) => accounts.find((account) => account.id === id),
    recordBatchCommitTimings: (_count, timings) => { observedTimings = timings; },
  });
  return {
    service,
    operations,
    values,
    failNextWrite: () => { failNextWrite = true; },
    resetOperations: () => {
      operations.gets = 0;
      operations.sets = 0;
      operations.removes = 0;
      operations.payeeBatches = 0;
      observedTimings = [];
    },
    timings: () => observedTimings,
  };
}

function addition(index: number) {
  return {
    date: "2026-09-01",
    payee: `Payee ${index % 5}`,
    category: "Groceries",
    memo: `memo ${index}`,
    checkNumber: `check ${index}`,
    tagIds: [`tag-${index % 3}`],
    outflow: 1,
    inflow: 0,
  };
}

test("mixed import batch reads, mutates, recalculates, and persists registers once", async () => {
  const harness = fixture();
  await harness.service.addTransactions({
    accountId: "checking",
    transactions: Array.from({ length: 200 }, (_, index) => addition(index)),
  });
  const before = await harness.service.getAccountRegisterView({ accountId: "checking" });
  const updates = before.transactions.slice(0, 100).map((transaction, index) => ({
    id: transaction.id,
    date: "2026-09-02",
    payee: `Updated ${index % 4}`,
    payeeId: `canonical-${index % 4}`,
    category: "Dining",
    categoryId: "category-dining",
    memo: `updated memo ${index}`,
    checkNumber: `updated check ${index}`,
    tagIds: ["updated-tag"],
    splitLines: index === 0 ? [
      { id: "split-a", category: "Dining", outflow: 0.4, inflow: 0 },
      { id: "split-b", category: "Groceries", outflow: 0.6, inflow: 0 },
    ] : undefined,
    outflow: 1,
    inflow: 0,
  }));
  harness.resetOperations();

  const result = await harness.service.commitTransactionBatch({
    accountId: "checking",
    additions: Array.from({ length: 100 }, (_, index) => addition(index + 200)),
    updates,
  });

  assert.equal(result.changeSet.addedTransactionIds.length, 100);
  assert.equal(result.changeSet.beforeUpdatedTransactions.length, 100);
  assert.equal(result.changeSet.afterUpdatedTransactions.length, 100);
  assert.equal(result.register.transactions.length, 300);
  assert.equal(result.register.workingBalance, -300);
  assert.equal(result.register.clearedBalance, 0);
  assert.equal(result.register.unclearedBalance, -300);
  assert.equal(harness.operations.payeeBatches, 1);
  assert.deepEqual(
    harness.timings().map(({ label }) => label),
    [
      "Prepare transfer lookup",
      "Collect payees",
      "Record payees",
      "Read registers",
      "Apply additions and updates",
      "Recalculate changed registers",
      "Persist registers",
    ],
  );
  const updated = result.register.transactions.find(({ id }) => id === updates[0]?.id);
  assert.equal(updated?.payeeId, "canonical-0");
  assert.equal(updated?.memo, "updated memo 0");
  assert.equal(updated?.checkNumber, "updated check 0");
  assert.deepEqual(updated?.tagIds, ["updated-tag"]);
  assert.equal(updated?.splitLines?.length, 2);

  const persisted = await harness.service.getAccountRegisterView({ accountId: "checking" });
  assert.deepEqual(
    JSON.parse(JSON.stringify(persisted)),
    JSON.parse(JSON.stringify(result.register)),
  );
});

test("batch transfer update changes both sides and recalculates final balances", async () => {
  const { service } = fixture();
  await service.addTransaction({
    accountId: "checking",
    transaction: {
      date: "2026-09-01", payee: "Transfer: Savings", category: "Transfer",
      memo: "before", outflow: 25, inflow: 0,
    },
  });
  const checkingBefore = await service.getAccountRegisterView({ accountId: "checking" });
  const source = checkingBefore.transactions[0]!;
  const result = await service.commitTransactionBatch({
    accountId: "checking",
    additions: [],
    updates: [{
      id: source.id, date: "2026-09-03", payee: source.payee,
      category: "Transfer", memo: "after", checkNumber: "42", outflow: 40, inflow: 0,
    }],
  });
  const savings = await service.getAccountRegisterView({ accountId: "savings" });
  assert.equal(result.register.workingBalance, -40);
  assert.equal(savings.workingBalance, 40);
  assert.equal(result.register.transactions[0]?.memo, "after");
  assert.equal(savings.transactions[0]?.memo, "after");
  assert.equal(savings.transactions[0]?.inflow, 40);
  assert.equal(savings.transactions[0]?.transferTransactionId, source.id);
});

test("batch persistence failure restores the exact pre-batch transaction storage", async () => {
  const harness = fixture();
  await harness.service.addTransactions({
    accountId: "checking",
    transactions: [addition(1), addition(2)],
  });
  const beforeValues = new Map(harness.values);
  const before = await harness.service.getAccountRegisterView({ accountId: "checking" });
  harness.failNextWrite();

  await assert.rejects(
    harness.service.commitTransactionBatch({
      accountId: "checking",
      additions: [addition(3)],
      updates: [{ ...before.transactions[0]!, payee: "Changed", category: "Dining" }],
    }),
    (error: unknown) => {
      assert.ok(error instanceof RegisterTransactionBatchCommitError);
      assert.equal(error.rollbackAttempted, true);
      assert.equal(error.rollbackSucceeded, true);
      return true;
    },
  );
  assert.deepEqual(harness.values, beforeValues);
  assert.deepEqual(
    await harness.service.getAccountRegisterView({ accountId: "checking" }),
    before,
  );
});
