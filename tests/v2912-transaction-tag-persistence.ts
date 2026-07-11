import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TRANSACTION_TAGS_STORAGE_KEY,
  readTransactionTags,
  writeTransactionTags,
} from "../apps/web/src/features/tags/transactionTagPersistence";
import { isBudgetScopedStorageKey } from "../apps/web/src/features/budget/budgetDataScope";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort";
import type { TransactionTagDefinition } from "../apps/web/src/features/tags/transactionTagTypes";

function createMemoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    listKeys: () => [...values.keys()],
  };
}

const storage = createMemoryStorage();
const tag: TransactionTagDefinition = {
  id: "tag-tax",
  name: "Tax",
  description: "EOFY expenses",
  colour: "red",
  autoTagImportedTransactions: false,
  archived: false,
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z",
};

writeTransactionTags(storage, [tag]);
const loaded = readTransactionTags(storage);
assert.deepEqual(loaded, [tag]);
loaded[0].name = "Changed outside persistence";
assert.equal(readTransactionTags(storage)[0].name, "Tax");

storage.setItem(TRANSACTION_TAGS_STORAGE_KEY, "not-json");
assert.deepEqual(readTransactionTags(storage), []);

storage.setItem(
  TRANSACTION_TAGS_STORAGE_KEY,
  JSON.stringify([
    {
      id: " tag-review ",
      name: " Needs Review ",
      colour: "yellow",
    },
    {
      id: "tag-review",
      name: "Duplicate",
      colour: "red",
    },
    {
      id: "invalid-colour",
      name: "Invalid",
      colour: "pink",
    },
  ]),
);
assert.deepEqual(readTransactionTags(storage), [
  {
    id: "tag-review",
    name: "Needs Review",
    colour: "yellow",
    autoTagImportedTransactions: false,
    archived: false,
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  },
]);

assert.equal(isBudgetScopedStorageKey(TRANSACTION_TAGS_STORAGE_KEY), true);

const registerServiceSource = readFileSync(
  "apps/web/src/features/accounts/accountRegisterService.ts",
  "utf8",
);
assert.match(
  registerServiceSource,
  /tagIds: normaliseTagIds\(input\.tagIds\)/,
  "new register transactions must persist tag IDs",
);
assert.match(
  registerServiceSource,
  /input\.transaction\.tagIds === undefined[\s\S]*?normaliseTagIds\(transaction\.tagIds\)/,
  "transaction updates must preserve existing tag IDs when omitted",
);
assert.match(
  registerServiceSource,
  /tagIds: normaliseTagIds\(transaction\.tagIds\)/,
  "loaded register transactions must normalise tag IDs",
);

console.log("v2.91.2 transaction tag persistence checks passed");
