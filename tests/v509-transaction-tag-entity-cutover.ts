import assert from "node:assert/strict";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort";
import {
  createTransactionTagEntityRepository,
  listProjectedTransactionTags,
  mergeTransactionTagEntities,
  transactionTagTimestampFor,
} from "../apps/web/src/features/tags/entities/transactionTagEntity";
import { readTransactionTags, writeTransactionTags } from "../apps/web/src/features/tags/transactionTagPersistence";
import type { TransactionTagDefinition } from "../apps/web/src/features/tags/transactionTagTypes";

function memoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    listKeys: () => [...values.keys()],
  };
}

const storage = memoryStorage();
const first: TransactionTagDefinition = {
  id: "tag-tax",
  name: "Tax",
  description: "EOFY",
  colour: "red",
  icon: "file",
  autoTagImportedTransactions: true,
  archived: false,
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z",
};
const second: TransactionTagDefinition = {
  id: "tag-review",
  name: "Review",
  colour: "amber",
  autoTagImportedTransactions: false,
  archived: false,
  createdAt: "2026-07-26T00:00:01.000Z",
  updatedAt: "2026-07-26T00:00:01.000Z",
};

writeTransactionTags(storage, [first, second]);
assert.deepEqual(readTransactionTags(storage), [first, second]);
assert.equal(storage.getItem("budget-app.transaction-tags.v1"), null);

const repository = createTransactionTagEntityRepository(storage);
const before = repository.get(first.id)!;
writeTransactionTags(storage, [{ ...second }, { ...first, name: "Tax return", updatedAt: "2026-07-27T00:00:00.000Z" }]);
const after = repository.get(first.id)!;
assert.equal(after.fields.colour.timestamp.wallTime, before.fields.colour.timestamp.wallTime);
assert.notEqual(after.fields.name.timestamp.wallTime, before.fields.name.timestamp.wallTime);
assert.deepEqual(listProjectedTransactionTags(storage).map((tag) => tag.id), [second.id, first.id]);

writeTransactionTags(storage, [second]);
assert.equal(repository.get(first.id)?.metadata.tombstone !== null, true);
assert.deepEqual(readTransactionTags(storage), [second]);

const left = repository.get(second.id)!;
const remoteTimestamp = transactionTagTimestampFor(
  new Date(left.fields.name.timestamp.wallTime + 1),
);
const right = {
  ...left,
  fields: {
    ...left.fields,
    name: { value: "Remote review", timestamp: remoteTimestamp },
  },
};
assert.equal(mergeTransactionTagEntities(left, right).fields.name.value, "Remote review");

console.log("PASS: Transaction tags use replicated entities, preserve order and timestamps, merge fields, and tombstone deletions");
