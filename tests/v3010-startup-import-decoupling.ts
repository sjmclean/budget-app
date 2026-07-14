import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  configureAppPersistenceGateway,
  resetAppPersistenceGateway,
} from "../apps/web/src/features/persistence/appPersistenceGatewayFactory.js";
import { getPersistenceModeSummary } from "../apps/web/src/features/persistence/persistenceMode.js";
import type { AppPersistenceGateway } from "../apps/web/src/features/persistence/appPersistenceGateway.js";
import { browserLocalStoragePersistenceGateway } from "../apps/web/src/features/persistence/browserLocalStoragePersistenceGateway.js";

const storeSource = readFileSync(
  "apps/web/src/stores/budgetRegistryStore.ts",
  "utf8",
);
const diagnosticsSource = readFileSync(
  "apps/web/src/app/errors/appErrorDiagnostics.ts",
  "utf8",
);
const persistenceModeSource = readFileSync(
  "apps/web/src/features/persistence/persistenceMode.ts",
  "utf8",
);

assert.doesNotMatch(
  storeSource,
  /import\s*\{[^}]*createYnab4LauncherBudgetImportWithBackend[^}]*\}\s*from/,
  "budget registry store must not eagerly import the YNAB4 implementation",
);
assert.doesNotMatch(
  storeSource,
  /import\s*\{[^}]*createActualBudgetLauncherImportWithBackend[^}]*\}\s*from/,
  "budget registry store must not eagerly import the Actual Budget implementation",
);
assert.match(
  storeSource.replace(/\s+/g, ""),
  /awaitimport\("\.\.\/features\/budget\/ynab4LauncherImport"\)/,
  "YNAB4 import implementation should load dynamically inside the store action",
);
assert.match(
  storeSource.replace(/\s+/g, ""),
  /awaitimport\("\.\.\/features\/budget\/actualBudgetLauncherImport"\)/,
  "Actual Budget import implementation should load dynamically inside the store action",
);

assert.doesNotMatch(
  persistenceModeSource,
  /appPersistenceGatewayFactory/,
  "persistence mode summary must not import the concrete gateway factory",
);
assert.match(
  persistenceModeSource,
  /getConfiguredPersistenceMetadata/,
  "persistence mode summary should use lightweight runtime metadata",
);
assert.match(
  diagnosticsSource,
  /getPersistenceModeSummary/,
  "diagnostics should continue to report persistence mode",
);

const sqliteMetadataGateway: AppPersistenceGateway = {
  ...browserLocalStoragePersistenceGateway,
  metadata: {
    kind: "sqlite-adapter",
    label: "SQLite test gateway",
    description: "Synthetic gateway for runtime metadata validation.",
    isProductionPersistence: true,
  },
};

try {
  resetAppPersistenceGateway();
  assert.equal(getPersistenceModeSummary().mode, "browser-local-storage");

  configureAppPersistenceGateway(sqliteMetadataGateway);
  assert.deepEqual(getPersistenceModeSummary(), {
    mode: "sqlite-adapter",
    label: "SQLite test gateway",
    description: "Synthetic gateway for runtime metadata validation.",
    risk: "production-ready",
  });
} finally {
  resetAppPersistenceGateway();
}

console.log("v3.01 startup import decoupling validation passed");
