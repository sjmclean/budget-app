import assert from "node:assert/strict";

import type { AppPersistenceGateway } from "../apps/web/src/features/persistence/appPersistenceGateway";
import { getAppPersistenceGateway } from "../apps/web/src/features/persistence/appPersistenceGatewayFactory";

const defaultGateway = getAppPersistenceGateway();

assert.equal(
  defaultGateway.metadata.kind,
  "browser-local-storage",
);

const explicitBrowserGateway = getAppPersistenceGateway(
  "browser-local-storage",
);

assert.equal(
  explicitBrowserGateway.metadata.kind,
  "browser-local-storage",
);

const sqliteStub = {
  metadata: {
    kind: "sqlite-adapter",
    label: "SQLite Stub",
    description: "SQLite Stub",
    isProductionPersistence: false,
  },
} as AppPersistenceGateway;

const sqliteGateway = getAppPersistenceGateway(
  "sqlite-adapter",
  sqliteStub,
);

assert.equal(
  sqliteGateway.metadata.kind,
  "sqlite-adapter",
);

assert.throws(() => {
  getAppPersistenceGateway("sqlite-adapter");
});

console.log("v1.32 gateway selection OK");