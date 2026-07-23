import assert from "node:assert/strict";

import { createSharedServerPersistenceProvider } from "../apps/web/src/features/persistence/sharedServerPersistenceProvider.js";
import type { SharedServerStorageClient } from "../apps/web/src/features/persistence/sharedServerStorageClient.js";

let revision = 3;
const appliedOperations: unknown[][] = [];

const client: SharedServerStorageClient = {
  async loadSnapshot() {
    return { revision, entries: {} };
  },

  async applyOperations(operations, expectedRevision) {
    assert.equal(expectedRevision, revision);
    appliedOperations.push([...operations]);
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

const provider = createSharedServerPersistenceProvider({ client });

assert.equal(provider.metadata.kind, "shared-server");
assert.equal(provider.metadata.isProductionPersistence, true);
assert.deepEqual(provider.capabilities, {
  sharedAcrossDevices: true,
  liveUpdates: true,
  offlineWrites: false,
  backups: true,
});

assert.equal(typeof provider.initialize, "function");
assert.equal(typeof provider.flush, "function");

await provider.initialize?.();

const accounts = await provider.accounts.createAccount({
  name: "Shared Cheque",
  type: "on-budget",
  startingBalance: 250,
});

assert.equal(accounts.length, 1);
assert.equal(accounts[0]?.name, "Shared Cheque");
assert.equal(provider.accounts.getAccountById(accounts[0]!.id)?.name, "Shared Cheque");

await provider.flush?.();

assert.equal(appliedOperations.length, 1);
assert.match(
  JSON.stringify(appliedOperations[0]),
  /budget-app\.accounts\.v1/,
  "shared provider should persist existing account services through the server storage mirror",
);

console.log("v1.45 shared server persistence provider validation passed");
