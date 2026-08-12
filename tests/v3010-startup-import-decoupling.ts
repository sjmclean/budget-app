import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  configureBudgetPersistenceProvider,
  resetBudgetPersistenceProvider,
} from "../apps/web/src/features/persistence/budgetPersistenceProviderFactory.js";
import { getPersistenceModeSummary } from "../apps/web/src/features/persistence/persistenceMode.js";
import type { BudgetPersistenceProvider } from "../apps/web/src/features/persistence/budgetPersistenceProvider.js";
import { createKeyValueBudgetPersistenceProvider } from "../apps/web/src/features/persistence/createKeyValueBudgetPersistenceProvider.js";
import { InMemoryKeyValueStorage } from "./support/persistence/inMemoryBudgetPersistence.js";

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

const localDatabaseMetadataProvider: BudgetPersistenceProvider =
  createKeyValueBudgetPersistenceProvider({
    storage: new InMemoryKeyValueStorage(),
    metadata: {
      kind: "local-database",
      label: "Local database test provider",
      description: "Synthetic provider for runtime metadata validation.",
      isProductionPersistence: true,
    },
    capabilities: {
      sharedAcrossDevices: false,
      liveUpdates: true,
      offlineWrites: true,
      backups: true,
    },
  });

try {
  resetBudgetPersistenceProvider();
  assert.equal(getPersistenceModeSummary().mode, "local-database");

  configureBudgetPersistenceProvider(localDatabaseMetadataProvider);
  assert.deepEqual(getPersistenceModeSummary(), {
    mode: "local-database",
    label: "Local database test provider",
    description: "Synthetic provider for runtime metadata validation.",
    risk: "production-ready",
  });
} finally {
  resetBudgetPersistenceProvider();
}

console.log("v3.01 startup import decoupling validation passed");
