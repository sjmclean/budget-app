import assert from "node:assert/strict";
import {
  classifyPersistenceKey,
  filterCanonicalOperationJournalEntries,
  filterCanonicalPersistenceEntries,
  mergeRestoredCanonicalPersistenceEntries,
} from "../apps/web/src/features/persistence/persistenceKeyClassification.ts";
import { exportBudgetPersistenceSnapshot } from "../apps/web/src/features/persistence/persistenceSnapshot.ts";
import { createOperationJournalEntry } from "../apps/web/src/features/persistence/operationJournal.ts";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.ts";

const canonicalKeys = [
  "budget-app.budget-registry.v1",
  "budget-app.accounts.v1",
  "budget-app.budgets.household.budget-app.accounts.v1",
  "budget-app.budget-view.v1.household.2026-07",
  "budget-app.entity-replication.v1/settings-preference-index",
  "budget-app.entity-replication.v1/settings-preference/settings",
  "budget-app.entity-replication.v1/transaction-import-preference-index",
  "budget-app.entity-replication.v1/transaction-import-preference/transaction-import",
];
const localOnlyKeys = [
  "budget-app.selected-budget-id.v1",
  "budget-app.settings.v1",
  "budget-app.import-diagnostics.v1",
  "budget-app.budgets.household.budget-app.unknown-cache.v1",
  "future-key-without-an-explicit-sync-contract",
];

for (const key of canonicalKeys) {
  assert.equal(classifyPersistenceKey(key), "canonical", `${key} should be canonical`);
}
for (const key of localOnlyKeys) {
  assert.equal(classifyPersistenceKey(key), "local-only", `${key} should stay local`);
}

const entries = Object.fromEntries([
  ...canonicalKeys.map((key) => [key, `canonical:${key}`]),
  ...localOnlyKeys.map((key) => [key, `local:${key}`]),
]);
assert.deepEqual(
  Object.keys(filterCanonicalPersistenceEntries(entries)).sort(),
  [...canonicalKeys].sort(),
);

const storageMap = new Map(Object.entries(entries));
const storage: KeyValueStoragePort = {
  getItem: (key) => storageMap.get(key) ?? null,
  setItem: (key, value) => void storageMap.set(key, value),
  removeItem: (key) => void storageMap.delete(key),
  listKeys: () => [...storageMap.keys()],
};
assert.deepEqual(
  Object.keys(exportBudgetPersistenceSnapshot(storage).entries).sort(),
  [...canonicalKeys].sort(),
  "snapshots must exclude selected-budget and all unknown/local-only records",
);

const operations = [...canonicalKeys, ...localOnlyKeys].map((key, index) =>
  createOperationJournalEntry({
    deviceId: "device-a",
    sequence: index + 1,
    operationId: `operation-${index + 1}`,
    mutation: { type: "key-value.set", key, value: "value" },
  }),
);
assert.deepEqual(
  filterCanonicalOperationJournalEntries(operations).map((operation) => operation.mutation.key),
  canonicalKeys,
  "checkpoint replay must ignore local-only journal operations",
);

const restored = mergeRestoredCanonicalPersistenceEntries(entries, {
  "budget-app.budget-registry.v1": "restored-registry",
  "budget-app.accounts.v1": "restored-accounts",
  "budget-app.selected-budget-id.v1": "remote-selection",
});
assert.equal(restored["budget-app.budget-registry.v1"], "restored-registry");
assert.equal(restored["budget-app.accounts.v1"], "restored-accounts");
assert.equal(
  restored["budget-app.selected-budget-id.v1"],
  entries["budget-app.selected-budget-id.v1"],
  "checkpoint restore must preserve the device's selected budget",
);
assert.equal(
  restored["budget-app.settings.v1"],
  entries["budget-app.settings.v1"],
  "checkpoint restore must preserve local preferences",
);

console.log("PASS: Phase 1 persistence boundary keeps local state out of replication and recovery");
