import assert from "node:assert/strict";
import { createAccountRegisterService } from "../apps/web/src/features/accounts/accountRegisterService.js";
import { createTransactionEntityRepository } from "../apps/web/src/features/accounts/entities/transactionEntity.js";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.js";

const values = new Map<string, string>();
const storage: KeyValueStoragePort = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => { values.set(key, value); },
  removeItem: (key) => { values.delete(key); },
  listKeys: () => [...values.keys()],
};
const accounts = [
  { id: "everyday", name: "Everyday", type: "on-budget" as const, startingBalance: 0 },
  { id: "savings", name: "Savings", type: "on-budget" as const, startingBalance: 0 },
];
const service = createAccountRegisterService({
  storage,
  recordPayee: async () => {},
  findPayeeIdByName: () => undefined,
  readAccounts: () => accounts,
  getAccountById: (id) => accounts.find((account) => account.id === id),
});

await service.addTransaction({
  accountId: "everyday",
  transaction: { date: "2026-07-01", payee: "Grocer", category: "Food", inflow: 0, outflow: 25 },
});
const before = createTransactionEntityRepository(storage).list()[0];
assert.ok(before);
await service.updateTransaction({
  accountId: "everyday",
  transaction: { ...(await service.getAccountRegisterView({ accountId: "everyday" })).transactions[0], memo: "weekly shop" },
});
const after = createTransactionEntityRepository(storage).get(before.metadata.id);
assert.ok(after);
assert.deepEqual(after.fields.date.timestamp, before.fields.date.timestamp);
assert.notDeepEqual(after.fields.memo.timestamp, before.fields.memo.timestamp);

await service.addTransaction({
  accountId: "everyday",
  transaction: { date: "2026-07-02", payee: "Transfer: Savings", category: "Transfer", inflow: 0, outflow: 10 },
});
assert.equal((await service.getAccountRegisterView({ accountId: "savings" })).workingBalance, 10);
const firstId = (await service.getAccountRegisterView({ accountId: "everyday" })).transactions.find((t) => t.payee === "Grocer")!.id;
await service.deleteTransaction({ accountId: "everyday", transactionId: firstId });
assert.ok(createTransactionEntityRepository(storage).get(firstId)?.metadata.tombstone);
assert.equal([...values.keys()].some((key) => key.includes("account-registers.v1")), false);
console.log("PASS: Transaction register persistence is entity-only with LWW updates, transfers and tombstones");
