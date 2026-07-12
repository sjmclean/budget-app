import assert from "node:assert/strict";
import {
  TransactionTagInUseError,
  TransactionTagNotFoundError,
  TransactionTagValidationError,
  createTransactionTagService,
} from "../apps/web/src/features/tags/transactionTagService";
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
let timestampIndex = 0;
let idIndex = 0;
const timestamps = [
  "2026-07-11T01:00:00.000Z",
  "2026-07-11T02:00:00.000Z",
  "2026-07-11T03:00:00.000Z",
  "2026-07-11T04:00:00.000Z",
  "2026-07-11T05:00:00.000Z",
  "2026-07-11T06:00:00.000Z",
];
const usage = new Map<string, number>();

const service = createTransactionTagService({
  storage,
  now: () => timestamps[timestampIndex++] ?? timestamps.at(-1)!,
  createId: () => `tag-${++idIndex}`,
  countUsage: (tagId) => usage.get(tagId) ?? 0,
});

const tax = service.createTag({
  name: "  Tax   Expenses  ",
  description: "  EOFY records  ",
  colour: "red",
});
assert.deepEqual(tax, {
  id: "tag-1",
  name: "Tax Expenses",
  description: "EOFY records",
  colour: "red",
  autoTagImportedTransactions: false,
  archived: false,
  createdAt: timestamps[0],
  updatedAt: timestamps[0],
});

const review = service.createTag({
  name: "Needs Review",
  colour: "yellow",
  autoTagImportedTransactions: true,
});
assert.equal(review.id, "tag-2");
assert.deepEqual(
  service.listTags().map((tag) => tag.name),
  ["Tax Expenses", "Needs Review"],
  "active tags should retain their persisted order",
);

assert.throws(
  () =>
    service.createTag({
      name: " tax expenses ",
      colour: "blue",
    }),
  TransactionTagValidationError,
  "tag names must be unique without regard to case or spacing",
);
assert.throws(
  () => service.createTag({ name: "   ", colour: "green" }),
  TransactionTagValidationError,
);

const updatedTax = service.updateTag({
  id: tax.id,
  name: "Tax",
  description: " ",
  colour: "purple",
  autoTagImportedTransactions: true,
});
assert.equal(updatedTax.name, "Tax");
assert.equal(updatedTax.description, undefined);
assert.equal(updatedTax.colour, "purple");
assert.equal(updatedTax.createdAt, timestamps[0]);
assert.equal(updatedTax.updatedAt, timestamps[2]);

const archivedReview = service.archiveTag(review.id);
assert.equal(archivedReview.archived, true);
assert.deepEqual(
  service.listTags().map((tag) => tag.id),
  [tax.id],
  "archived tags should be hidden by default",
);
assert.deepEqual(
  service.listTags({ includeArchived: true }).map((tag) => tag.id),
  [tax.id, review.id],
  "including archived tags should retain their persisted order",
);

const restoredReview = service.restoreTag(review.id);
assert.equal(restoredReview.archived, false);

usage.set(tax.id, 3);
assert.deepEqual(service.getUsage(tax.id), {
  tagId: tax.id,
  transactionCount: 3,
});
assert.throws(
  () => service.deleteTag(tax.id),
  TransactionTagInUseError,
  "tags assigned to transactions must not be deleted",
);

usage.set(tax.id, 0);
service.deleteTag(tax.id);
assert.deepEqual(
  service.listTags({ includeArchived: true }).map((tag) => tag.id),
  [review.id],
);

assert.throws(
  () => service.updateTag({
    id: "missing",
    name: "Missing",
    colour: "blue",
    autoTagImportedTransactions: false,
  }),
  TransactionTagNotFoundError,
);
assert.throws(
  () => service.getUsage("missing"),
  TransactionTagNotFoundError,
);

console.log("v2.91.4 transaction tag service checks passed");
