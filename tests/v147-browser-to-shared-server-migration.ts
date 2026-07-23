import assert from "node:assert/strict";

import {
  inspectBrowserToSharedServerMigration,
  migrateBrowserBudgetToSharedServer,
  partitionEntries,
} from "../apps/web/src/features/persistence/browserToSharedServerMigration.js";
import { exportBudgetPersistenceSnapshot } from "../apps/web/src/features/persistence/persistenceSnapshot.js";
import { browserLocalStorageKeyValueStorage } from "../apps/web/src/features/persistence/keyValueStoragePort.js";
import type {
  SharedServerStorageClient,
  SharedServerStorageOperation,
  SharedServerStorageSnapshot,
} from "../apps/web/src/features/persistence/sharedServerStorageClient.js";

const values = new Map<string, string>([
  ["budget-app.budget-registry.v1", '{"budgets":[{"id":"household"}]}'],
  ["budget-app.selected-budget-id.v1", "household"],
  ["budget-app.budgets.household.budget-app.accounts.v1", '[{"id":"account-1"}]'],
  ["budget-app.budget-view.v1.household.2026-07", '{"month":"2026-07"}'],
  ["budget-app.settings.v1", '{"general":{}}'],
  ["budget-app.version-history-index.v1.household", '{"snapshots":[]}'],
  ["budget-app.actual-budget-launcher-import.v1.file-imported", "true"],
  ["unrelated-key", "do-not-copy"],
]);

const localStorage = {
  get length() {
    return values.size;
  },
  key(index: number) {
    return [...values.keys()][index] ?? null;
  },
  getItem(key: string) {
    return values.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    values.set(key, value);
  },
  removeItem(key: string) {
    values.delete(key);
  },
};

(globalThis as typeof globalThis & {
  window: { localStorage: typeof localStorage };
}).window = { localStorage };

let snapshot: SharedServerStorageSnapshot = {
  revision: 0,
  entries: {},
};
let bootstrapCalls = 0;
let operationCalls = 0;

const client: SharedServerStorageClient = {
  async loadSnapshot() {
    return snapshot;
  },
  async applyOperations(
    operations: readonly SharedServerStorageOperation[],
    expectedRevision: number,
  ) {
    assert.equal(expectedRevision, snapshot.revision);
    operationCalls += 1;
    for (const operation of operations) {
      if (operation.type === "set") snapshot.entries[operation.key] = operation.value;
      else delete snapshot.entries[operation.key];
    }
    snapshot.revision += 1;
    return { revision: snapshot.revision };
  },
  async bootstrap(entries) {
    bootstrapCalls += 1;
    snapshot = {
      revision: 1,
      entries: { ...entries },
    };
    return {
      revision: 1,
      importedKeys: Object.keys(entries).length,
    };
  },
  async getHealth() {
    return { status: "ok", storage: "sqlite", revision: snapshot.revision };
  },
};

try {
  const exported = exportBudgetPersistenceSnapshot(browserLocalStorageKeyValueStorage);
  assert.deepEqual(Object.keys(exported.entries).sort(), [
    "budget-app.budget-registry.v1",
    "budget-app.budget-view.v1.household.2026-07",
    "budget-app.budgets.household.budget-app.accounts.v1",
    "budget-app.selected-budget-id.v1",
  ]);
  assert.equal(exported.entryCount, 4);
  assert.ok(exported.byteLength > 0);

  const inspection = await inspectBrowserToSharedServerMigration({
    client,
    exportSnapshot: () => exported,
  });

  assert.equal(inspection.canMigrate, true);
  assert.equal(inspection.browserKeyCount, 4);
  assert.equal(inspection.serverKeyCount, 0);

  const forcedBatches = partitionEntries(exported.entries, 100);
  assert.ok(forcedBatches.length > 1, "small batch limit should split the snapshot");

  const result = await migrateBrowserBudgetToSharedServer({
    client,
    exportSnapshot: () => exported,
    maxBatchBytes: 100,
  });
  assert.equal(result.importedKeys, 4);
  assert.equal(bootstrapCalls, 1);
  assert.ok(operationCalls > 0, "remaining records should be uploaded in batches");
  assert.deepEqual(snapshot.entries, exported.entries);

  const blocked = await inspectBrowserToSharedServerMigration({
    client,
    exportSnapshot: () => exported,
  });
  assert.equal(blocked.canMigrate, false);
  assert.equal(blocked.serverKeyCount, 4);

  assert.equal(
    browserLocalStorageKeyValueStorage.getItem("budget-app.settings.v1"),
    '{"general":{}}',
    "migration must leave browser data untouched",
  );

  console.log("v1.47 canonical browser-to-shared-server migration validation passed");
} finally {
  delete (globalThis as typeof globalThis & { window?: unknown }).window;
}
