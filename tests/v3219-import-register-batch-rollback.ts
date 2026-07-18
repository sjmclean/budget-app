import assert from "node:assert/strict";
import { BrowserPersistentAccountRegisterService } from "../apps/web/src/features/accounts/accountRegisterService";
import { RegisterTransactionBatchCommitError } from "../apps/web/src/features/accounts/accountRegisterPersistencePort";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort";

class MemoryStorage implements KeyValueStoragePort {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const storage = new MemoryStorage();
const account = {
  id: "checking",
  name: "Checking",
  type: "on-budget" as const,
  startingBalance: 0,
  createdAt: "2026-07-18T00:00:00.000Z",
  closedAt: null,
};
const service = new BrowserPersistentAccountRegisterService({
  storage,
  async recordPayee() {},
  async recordPayees() {},
  findPayeeIdByName() { return undefined; },
  readAccounts() { return [account]; },
  getAccountById(id) { return id === account.id ? account : undefined; },
});

await service.addTransaction({
  accountId: account.id,
  transaction: {
    date: "2026-07-01",
    payee: "Existing",
    category: "Groceries",
    inflow: 0,
    outflow: 10,
  },
});

const before = await service.getAccountRegisterView({ accountId: account.id });
const existing = before.transactions[0];
const successful = await service.commitTransactionBatch({
  accountId: account.id,
  additions: [{
    date: "2026-07-02",
    payee: "Imported",
    category: "Dining Out",
    inflow: 0,
    outflow: 20,
  }],
  updates: [{
    id: existing.id,
    date: "2026-07-03",
    payee: existing.payee,
    payeeId: existing.payeeId,
    category: existing.category,
    categoryId: existing.categoryId,
    memo: existing.memo,
    checkNumber: existing.checkNumber,
    inflow: existing.inflow,
    outflow: existing.outflow,
    splitLines: existing.splitLines,
  }],
});
assert.equal(successful.rollbackMode, "storage-snapshot");
assert.equal(successful.changeSet.addedTransactionIds.length, 1);
assert.equal(successful.changeSet.beforeUpdatedTransactions[0]?.date, "2026-07-01");
assert.equal(successful.changeSet.afterUpdatedTransactions[0]?.date, "2026-07-03");

const stableSnapshot = storage.getItem("budget-app.account-registers.v1");
const originalUpdate = service.updateTransaction.bind(service);
service.updateTransaction = async () => {
  throw new Error("forced matched-update failure");
};

await assert.rejects(
  service.commitTransactionBatch({
    accountId: account.id,
    additions: [{
      date: "2026-07-04",
      payee: "Must Roll Back",
      category: "Groceries",
      inflow: 0,
      outflow: 30,
    }],
    updates: [{
      id: existing.id,
      date: "2026-07-05",
      payee: existing.payee,
      category: existing.category,
      inflow: existing.inflow,
      outflow: existing.outflow,
    }],
  }),
  (error: unknown) => {
    assert.ok(error instanceof RegisterTransactionBatchCommitError);
    assert.equal(error.rollbackAttempted, true);
    assert.equal(error.rollbackSucceeded, true);
    return true;
  },
);
assert.equal(storage.getItem("budget-app.account-registers.v1"), stableSnapshot);
service.updateTransaction = originalUpdate;

console.log("v3.21.9 import register batch rollback regression passed");
