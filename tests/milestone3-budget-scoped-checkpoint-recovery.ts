import assert from "node:assert/strict";
import {
  assertCheckpointIsInScope,
  createPersistenceCheckpoint,
  filterCheckpointEntriesForScope,
} from "../apps/web/src/features/persistence/checkpoint";
import {
  mergeScopedPersistenceEntries,
  shouldPruneJournalEntry,
} from "../apps/web/src/features/persistence/localDatabaseKeyValueStorage";
import { createOperationJournalEntry } from
  "../apps/web/src/features/persistence/operationJournal";

const prefixA = "budget-app.budgets.budget-a.";
const prefixB = "budget-app.budgets.budget-b.";
const checkpointA = createPersistenceCheckpoint({
  checkpointId: "checkpoint-a",
  deviceId: "server",
  throughSequence: 4,
  schemaVersion: 4,
  entries: {
    [`${prefixA}accounts`]: "[\"restored-a\"]",
    [`${prefixA}payees`]: "[]",
  },
});

assert.doesNotThrow(() => assertCheckpointIsInScope(checkpointA, "budget-a"));
const ynab4MetadataKey = "budget-app.ynab4-launcher-import.v1.budget-a";
const scopedEntries = filterCheckpointEntriesForScope({
  [`${prefixA}accounts`]: "[]",
  [`${prefixB}accounts`]: "[]",
  [ynab4MetadataKey]: JSON.stringify({ budgetId: "budget-a" }),
}, "budget-a");
assert.deepEqual(Object.keys(scopedEntries).sort(), [
  `${prefixA}accounts`,
  ynab4MetadataKey,
].sort());
assert.doesNotThrow(() => assertCheckpointIsInScope(createPersistenceCheckpoint({
  checkpointId: "ynab4-metadata",
  deviceId: "server",
  throughSequence: 4,
  schemaVersion: 4,
  entries: scopedEntries,
}), "budget-a"));
assert.throws(
  () => assertCheckpointIsInScope(createPersistenceCheckpoint({
    checkpointId: "mixed",
    deviceId: "server",
    throughSequence: 4,
    schemaVersion: 4,
    entries: { [`${prefixA}accounts`]: "[]", [`${prefixB}accounts`]: "[]" },
  }), "budget-a"),
  /outside budget budget-a/,
);

const merged = mergeScopedPersistenceEntries({
  [`${prefixA}accounts`]: "[\"old-a\"]",
  [`${prefixA}transactions`]: "[]",
  [`${prefixB}accounts`]: "[\"untouched-b\"]",
  "budget-app.global-setting": "preserved",
}, checkpointA.entries, "budget-a");

assert.equal(merged[`${prefixA}accounts`], "[\"restored-a\"]");
assert.equal(merged[`${prefixA}transactions`], undefined);
assert.equal(merged[`${prefixB}accounts`], "[\"untouched-b\"]");
assert.equal(merged["budget-app.global-setting"], "preserved");

const operation = (sequence: number, key: string) => createOperationJournalEntry({
  deviceId: "device",
  sequence,
  operationId: `operation-${sequence}`,
  mutation: { type: "key-value.set", key, value: "value" },
});
assert.equal(shouldPruneJournalEntry(operation(2, `${prefixA}accounts`), 3, "budget-a"), true);
assert.equal(shouldPruneJournalEntry(operation(2, `${prefixB}accounts`), 3, "budget-a"), false);
assert.equal(shouldPruneJournalEntry(operation(4, `${prefixA}accounts`), 3, "budget-a"), false);

console.log("Milestone 3 budget-scoped checkpoint recovery and compaction contracts passed.");
