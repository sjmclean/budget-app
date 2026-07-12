import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createTransactionTagService } from "../apps/web/src/features/tags/transactionTagService";
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
let id = 0;
const service = createTransactionTagService({
  storage,
  createId: () => `tag-${++id}`,
  now: () => "2026-07-12T00:00:00.000Z",
});

const tax = service.createTag({ name: "Tax", colour: "red" });
const household = service.createTag({ name: "Household", colour: "green" });
const review = service.createTag({ name: "Review", colour: "yellow" });

assert.deepEqual(
  service.listTags().map((tag) => tag.id),
  [tax.id, household.id, review.id],
  "tags should retain creation order",
);

service.reorderTags([review.id, tax.id, household.id]);

assert.deepEqual(
  service.listTags().map((tag) => tag.id),
  [review.id, tax.id, household.id],
  "reordered tag order must persist",
);

const managerSource = readFileSync(
  "apps/web/src/features/tags/TransactionTagManager.tsx",
  "utf8",
);

assert.match(managerSource, /service\.reorderTags/);
assert.match(managerSource, /draggable=\{canReorder\}/);
assert.match(managerSource, /Clear search to reorder tags/);
assert.match(managerSource, /transaction-tag-row-drop-target/);

console.log("v2.92.5 transaction tag ordering checks passed");
