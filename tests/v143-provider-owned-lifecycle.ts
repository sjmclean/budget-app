import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { browserLocalStoragePersistenceGateway } from "../apps/web/src/features/persistence/browserLocalStoragePersistenceGateway.js";

assert.equal(
  typeof browserLocalStoragePersistenceGateway.initialize,
  "function",
  "the browser provider should own browser storage hydration",
);
assert.equal(
  typeof browserLocalStoragePersistenceGateway.flush,
  "function",
  "the browser provider should own browser storage flushing",
);

const mainSource = readFileSync("apps/web/src/main.tsx", "utf8");
assert.match(
  mainSource,
  /await persistenceProvider\.initialize\?\.\(\);/,
  "startup should initialise the active provider",
);
assert.match(
  mainSource,
  /installPersistenceProviderLifecycle\(persistenceProvider\);/,
  "startup should install lifecycle flushing for the active provider",
);
assert.doesNotMatch(
  mainSource,
  /hydrateBrowserStorageBackend|installBrowserStorageLifecycleFlush/,
  "startup should not depend directly on browser storage lifecycle functions",
);

const lifecycleSource = readFileSync(
  "apps/web/src/features/persistence/persistenceProviderLifecycle.ts",
  "utf8",
);
assert.match(
  lifecycleSource,
  /provider\.flush/,
  "the lifecycle helper should flush through the selected provider",
);
assert.doesNotMatch(
  lifecycleSource,
  /flushBrowserStorageBackend/,
  "the lifecycle helper should remain provider-agnostic",
);

console.log("v1.43 provider-owned lifecycle validation passed");
