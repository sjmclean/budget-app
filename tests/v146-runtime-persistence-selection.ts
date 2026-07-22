import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { browserLocalStoragePersistenceGateway } from "../apps/web/src/features/persistence/browserLocalStoragePersistenceGateway.js";
import {
  configureBudgetPersistenceProviderFromRuntime,
  createConfiguredBudgetPersistenceProvider,
} from "../apps/web/src/features/persistence/configuredPersistenceProvider.js";
import {
  getBudgetPersistenceProvider,
  resetBudgetPersistenceProvider,
} from "../apps/web/src/features/persistence/budgetPersistenceProviderFactory.js";

try {
  validateBrowserProviderIsTheSafeDefault();
  validateSharedProviderCanBeSelectedExplicitly();
  validateUnknownModesFailFast();
  validateRuntimeConfigurationInstallsTheProvider();
  validateStartupPrefersHostProviderBeforeRuntimeConfiguration();

  console.log("v1.46 runtime persistence selection validation passed");
} finally {
  resetBudgetPersistenceProvider();
}

function validateBrowserProviderIsTheSafeDefault(): void {
  assert.equal(
    createConfiguredBudgetPersistenceProvider(),
    browserLocalStoragePersistenceGateway,
    "missing deployment configuration should preserve browser localStorage",
  );
}

function validateSharedProviderCanBeSelectedExplicitly(): void {
  const provider = createConfiguredBudgetPersistenceProvider({
    mode: "shared-server",
    apiBaseUrl: "http://budget-host.test/",
  });

  assert.equal(provider.metadata.kind, "shared-server");
  assert.equal(provider.capabilities.sharedAcrossDevices, true);
  assert.equal(typeof provider.initialize, "function");
}

function validateUnknownModesFailFast(): void {
  assert.throws(
    () => createConfiguredBudgetPersistenceProvider({ mode: "dropbox" }),
    /Unsupported budget persistence mode: dropbox/,
  );
}

function validateRuntimeConfigurationInstallsTheProvider(): void {
  resetBudgetPersistenceProvider();
  const provider = configureBudgetPersistenceProviderFromRuntime({
    mode: "shared-server",
  });

  assert.equal(getBudgetPersistenceProvider(), provider);
  assert.equal(provider.metadata.kind, "shared-server");
}

function validateStartupPrefersHostProviderBeforeRuntimeConfiguration(): void {
  const source = readFileSync("apps/web/src/main.tsx", "utf8");
  const hostBootstrapIndex = source.indexOf(
    "bootstrapHostBudgetPersistenceProvider()",
  );
  const runtimeConfigurationIndex = source.indexOf(
    "configureBudgetPersistenceProviderFromRuntime()",
  );
  const providerSelectionIndex = source.indexOf(
    "getBudgetPersistenceProvider()",
  );

  assert.ok(hostBootstrapIndex >= 0, "startup should inspect the host provider");
  assert.ok(
    runtimeConfigurationIndex > hostBootstrapIndex,
    "deployment configuration should be considered after host integration",
  );
  assert.ok(
    providerSelectionIndex > runtimeConfigurationIndex,
    "the active provider should be selected after runtime configuration",
  );
  assert.match(
    source,
    /if \(!hostProvider\)\s*{\s*configureBudgetPersistenceProviderFromRuntime\(\);\s*}/,
    "runtime configuration must not replace an explicitly host-provided provider",
  );
}
