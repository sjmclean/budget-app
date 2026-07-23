import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createSharedServerKeyValueStorage } from "../apps/web/src/features/persistence/sharedServerKeyValueStorage.js";
import { createSharedServerPersistenceProvider } from "../apps/web/src/features/persistence/sharedServerPersistenceProvider.js";
import type { SharedServerStorageClient } from "../apps/web/src/features/persistence/sharedServerStorageClient.js";

let serverRevision = 11;
let serverEntries: Record<string, string> = {
  "budget-app.example": "initial",
};
let snapshotLoads = 0;
let healthChecks = 0;

const client: SharedServerStorageClient = {
  async loadSnapshot() {
    snapshotLoads += 1;
    return {
      revision: serverRevision,
      entries: { ...serverEntries },
    };
  },

  async applyOperations(operations, expectedRevision) {
    assert.equal(expectedRevision, serverRevision);
    for (const operation of operations) {
      if (operation.type === "set") {
        serverEntries[operation.key] = operation.value;
      } else {
        delete serverEntries[operation.key];
      }
    }
    serverRevision += 1;
    return { revision: serverRevision };
  },

  async bootstrap(entries) {
    serverEntries = { ...entries };
    serverRevision += 1;
    return { revision: serverRevision, importedKeys: Object.keys(entries).length };
  },

  async getHealth() {
    healthChecks += 1;
    return { status: "ok", storage: "sqlite", revision: serverRevision };
  },
};

const storage = createSharedServerKeyValueStorage({
  client,
  pollIntervalMs: 5,
});
await storage.initialize();

assert.equal(snapshotLoads, 1);
assert.equal(await storage.refreshIfChanged(), false);
assert.equal(
  snapshotLoads,
  1,
  "an unchanged health revision should avoid downloading the snapshot",
);

serverEntries["budget-app.example"] = "remote update";
serverRevision += 1;

assert.equal(await storage.refreshIfChanged(), true);
assert.equal(storage.getItem("budget-app.example"), "remote update");
assert.equal(snapshotLoads, 2);

let notifications = 0;
const stopWatching = storage.watch(() => {
  notifications += 1;
});

await new Promise((resolve) => setTimeout(resolve, 1));
assert.equal(notifications, 0, "watching should ignore an unchanged revision");

serverEntries["budget-app.remote"] = "new value";
serverRevision += 1;
await new Promise((resolve) => setTimeout(resolve, 15));
stopWatching();

assert.equal(notifications, 1, "watching should notify after a remote revision");
assert.equal(storage.getItem("budget-app.remote"), "new value");
assert.ok(healthChecks >= 3);

const provider = createSharedServerPersistenceProvider({ client });
assert.equal(provider.capabilities.liveUpdates, true);
assert.equal(typeof provider.watch, "function");

const lifecycleSource = readFileSync(
  "apps/web/src/features/persistence/persistenceProviderLifecycle.ts",
  "utf8",
);
assert.match(lifecycleSource, /provider\.watch/);
assert.match(lifecycleSource, /document\.visibilityState === "hidden"/);
assert.match(lifecycleSource, /window\.location\.reload\(\)/);

console.log("v1.53 shared budget automatic refresh validation passed");
