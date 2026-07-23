import assert from "node:assert/strict";

import { createSharedServerKeyValueStorage } from "../apps/web/src/features/persistence/sharedServerKeyValueStorage.js";
import type {
  SharedServerStorageClient,
  SharedServerStorageOperation,
} from "../apps/web/src/features/persistence/sharedServerStorageClient.js";

const appliedBatches: SharedServerStorageOperation[][] = [];
let revision = 7;
let failNextWrite = false;

const client: SharedServerStorageClient = {
  async loadSnapshot() {
    return {
      revision,
      entries: {
        "budget-app.example": "one",
        "budget-app.other": "two",
      },
    };
  },

  async applyOperations(operations, expectedRevision) {
    if (failNextWrite) {
      failNextWrite = false;
      throw new Error("Synthetic shared storage write failure.");
    }

    assert.equal(expectedRevision, revision);
    appliedBatches.push([...operations]);
    revision += 1;
    return { revision };
  },

  async bootstrap(entries) {
    revision += 1;
    return { revision, importedKeys: Object.keys(entries).length };
  },

  async getHealth() {
    return { status: "ok", storage: "sqlite", revision };
  },
};

const storage = createSharedServerKeyValueStorage({ client });

assert.equal(storage.isInitialized(), false);
assert.throws(
  () => storage.setItem("before-initialize", "value"),
  /must be initialized/,
);

await storage.initialize();

assert.equal(storage.isInitialized(), true);
assert.equal(storage.getRevision(), 7);
assert.equal(storage.getItem("budget-app.example"), "one");
assert.deepEqual(storage.listKeys(), [
  "budget-app.example",
  "budget-app.other",
]);

storage.setItem("budget-app.example", "updated");
storage.setItem("budget-app.new", "three");
storage.removeItem("budget-app.other");

assert.equal(
  storage.getItem("budget-app.example"),
  "updated",
  "writes should update the local mirror immediately",
);
assert.equal(storage.getItem("budget-app.other"), null);
assert.equal(storage.getItem("budget-app.new"), "three");

await storage.flush();

assert.deepEqual(appliedBatches, [[
  { type: "set", key: "budget-app.example", value: "updated" },
  { type: "set", key: "budget-app.new", value: "three" },
  { type: "remove", key: "budget-app.other" },
]]);
assert.equal(storage.getRevision(), 8);

failNextWrite = true;
storage.setItem("budget-app.retry", "pending");
await assert.rejects(
  storage.flush(),
  /Synthetic shared storage write failure/,
  "flush should surface network write failures",
);

await storage.flush();
assert.deepEqual(appliedBatches.at(-1), [
  { type: "set", key: "budget-app.retry", value: "pending" },
]);
assert.equal(storage.getRevision(), 9);

console.log("v1.44 shared server key-value storage validation passed");
