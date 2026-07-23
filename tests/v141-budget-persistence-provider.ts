import assert from "node:assert/strict";

import type { BudgetPersistenceProvider } from "../apps/web/src/features/persistence/budgetPersistenceProvider.js";
import { browserLocalStoragePersistenceGateway } from "../apps/web/src/features/persistence/browserLocalStoragePersistenceGateway.js";
import { getAppPersistenceGateway } from "../apps/web/src/features/persistence/appPersistenceGatewayFactory.js";

const provider: BudgetPersistenceProvider = browserLocalStoragePersistenceGateway;

assert.equal(provider.metadata.kind, "browser-local-storage");
assert.deepEqual(provider.capabilities, {
  sharedAcrossDevices: false,
  liveUpdates: false,
  offlineWrites: true,
  backups: false,
});
assert.equal(
  getAppPersistenceGateway(),
  provider,
  "introducing the provider contract must not change the active browser persistence implementation",
);

console.log("v1.41 budget persistence provider contract validation passed");
