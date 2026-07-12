import assert from "node:assert/strict";
import {
  countTransactionTagReferences,
  removeTransactionTagReferences,
} from "../apps/web/src/features/accounts/accountRegisterService";
import { createTransactionTagService } from "../apps/web/src/features/tags/transactionTagService";
import {
  TRANSACTION_TAGS_STORAGE_KEY,
  writeTransactionTags,
} from "../apps/web/src/features/tags/transactionTagPersistence";
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

const storage = createMemoryStorage();
const tag = {
  id: "tag-tax",
  name: "Tax",
  colour: "red" as const,
  autoTagImportedTransactions: false,
  archived: false,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
};

writeTransactionTags(storage, [tag]);
storage.setItem(
  "budget-app.account-registers.v1",
  JSON.stringify({
    checking: {
      accountId: "checking",
      accountName: "Checking",
      accountType: "On budget",
      currencyCode: "AUD",
      clearedBalance: 0,
      unclearedBalance: 0,
      workingBalance: 0,
      transactions: [
        { id: "tx-1", tagIds: ["tag-tax", "tag-other"] },
        { id: "tx-2", tagIds: ["tag-tax"] },
      ],
    },
    savings: {
      accountId: "savings",
      accountName: "Savings",
      accountType: "On budget",
      currencyCode: "AUD",
      clearedBalance: 0,
      unclearedBalance: 0,
      workingBalance: 0,
      transactions: [{ id: "tx-3", tagIds: ["tag-other"] }],
    },
  }),
);

const service = createTransactionTagService({
  storage,
  countUsage: (tagId) => countTransactionTagReferences(storage, tagId),
  removeTagReferences: (tagId) =>
    removeTransactionTagReferences(storage, tagId),
});

assert.equal(service.getUsage(tag.id).transactionCount, 2);
service.deleteTag(tag.id);
assert.equal(storage.getItem(TRANSACTION_TAGS_STORAGE_KEY), "[]");
assert.equal(countTransactionTagReferences(storage, tag.id), 0);

const registers = JSON.parse(
  storage.getItem("budget-app.account-registers.v1") ?? "{}",
);
assert.deepEqual(registers.checking.transactions[0].tagIds, ["tag-other"]);
assert.deepEqual(registers.checking.transactions[1].tagIds, []);
assert.deepEqual(registers.savings.transactions[0].tagIds, ["tag-other"]);

console.log("v2.92.4 in-use tag deletion checks passed");
