import assert from "node:assert/strict";
import { BrowserPersistentAccountRegisterService } from "../apps/web/src/features/accounts/accountRegisterService";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort";

function createMemoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    listKeys: () => [...values.keys()],
  };
}

const accounts = [
  {
    id: "checking",
    name: "Checking",
    type: "on-budget" as const,
    startingBalance: 0,
  },
  {
    id: "savings",
    name: "Savings",
    type: "on-budget" as const,
    startingBalance: 0,
  },
];

const service = new BrowserPersistentAccountRegisterService({
  storage: createMemoryStorage(),
  recordPayee: async () => undefined,
  recordPayees: async () => undefined,
  findPayeeIdByName: () => undefined,
  readAccounts: () => accounts,
  getAccountById: (accountId) =>
    accounts.find((account) => account.id === accountId),
});

const created = await service.addTransaction({
  accountId: "checking",
  transaction: {
    date: "2026-07-11",
    tagIds: [" tag-tax ", "tag-tax", "", "tag-household"],
    payee: "Officeworks",
    category: "Office Supplies",
    memo: "Printer ink",
    inflow: 0,
    outflow: 50,
  },
});

const createdTransaction = created.transactions.find(
  (transaction) => transaction.payee === "Officeworks",
);
assert.ok(createdTransaction);
assert.deepEqual(createdTransaction.tagIds, ["tag-tax", "tag-household"]);

createdTransaction.tagIds?.push("outside-mutation");
const reloadedAfterMutation = await service.getAccountRegisterView({
  accountId: "checking",
});
const persistedAfterMutation = reloadedAfterMutation.transactions.find(
  (transaction) => transaction.id === createdTransaction.id,
);
assert.deepEqual(
  persistedAfterMutation?.tagIds,
  ["tag-tax", "tag-household"],
  "returned register views must not expose persisted tag arrays by reference",
);

const updatedWithoutTags = await service.updateTransaction({
  accountId: "checking",
  transaction: {
    id: createdTransaction.id,
    date: createdTransaction.date,
    payee: createdTransaction.payee,
    category: createdTransaction.category,
    memo: "Updated memo",
    inflow: createdTransaction.inflow,
    outflow: createdTransaction.outflow,
  },
});
const preservedTransaction = updatedWithoutTags.transactions.find(
  (transaction) => transaction.id === createdTransaction.id,
);
assert.deepEqual(
  preservedTransaction?.tagIds,
  ["tag-tax", "tag-household"],
  "omitting tagIds during an edit must preserve existing assignments",
);

const updatedWithTags = await service.updateTransaction({
  accountId: "checking",
  transaction: {
    id: createdTransaction.id,
    date: createdTransaction.date,
    tagIds: [" tag-review ", "tag-review"],
    payee: createdTransaction.payee,
    category: createdTransaction.category,
    memo: createdTransaction.memo,
    inflow: createdTransaction.inflow,
    outflow: createdTransaction.outflow,
  },
});
const replacedTransaction = updatedWithTags.transactions.find(
  (transaction) => transaction.id === createdTransaction.id,
);
assert.deepEqual(
  replacedTransaction?.tagIds,
  ["tag-review"],
  "explicit tag edits must replace and normalise assignments",
);

const transferSource = await service.addTransaction({
  accountId: "checking",
  transaction: {
    date: "2026-07-11",
    tagIds: ["tag-savings"],
    payee: "Transfer: Savings",
    category: "Transfer",
    memo: "Move money",
    inflow: 0,
    outflow: 100,
  },
});
const sourceTransfer = transferSource.transactions.find(
  (transaction) => transaction.transferAccountId === "savings",
);
assert.ok(sourceTransfer);
assert.deepEqual(sourceTransfer.tagIds, ["tag-savings"]);

const transferTarget = await service.getAccountRegisterView({
  accountId: "savings",
});
const targetTransfer = transferTarget.transactions.find(
  (transaction) => transaction.transferAccountId === "checking",
);
assert.ok(targetTransfer);
assert.deepEqual(
  targetTransfer.tagIds,
  ["tag-savings"],
  "both sides of a generated transfer must retain the source tags",
);

await service.updateTransaction({
  accountId: "checking",
  transaction: {
    id: sourceTransfer.id,
    date: sourceTransfer.date,
    tagIds: ["tag-reviewed"],
    payee: sourceTransfer.payee,
    category: sourceTransfer.category,
    memo: sourceTransfer.memo,
    inflow: sourceTransfer.inflow,
    outflow: sourceTransfer.outflow,
  },
});

const updatedTransferSource = await service.getAccountRegisterView({
  accountId: "checking",
});
const updatedSource = updatedTransferSource.transactions.find(
  (transaction) => transaction.id === sourceTransfer.id,
);
assert.deepEqual(updatedSource?.tagIds, ["tag-reviewed"]);

const updatedTransferTarget = await service.getAccountRegisterView({
  accountId: "savings",
});
const updatedTarget = updatedTransferTarget.transactions.find(
  (transaction) => transaction.id === targetTransfer.id,
);
assert.deepEqual(
  updatedTarget?.tagIds,
  ["tag-reviewed"],
  "editing a transfer must keep tag assignments in sync across both sides",
);

console.log("v2.91.3 register tag compatibility checks passed");
