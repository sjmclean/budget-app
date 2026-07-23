import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { AppPersistenceGateway } from "../apps/web/src/features/persistence/appPersistenceGateway.js";
import {
  bootstrapHostBudgetPersistenceProvider,
  bootstrapHostPersistenceGateway,
  getAppPersistenceGateway,
  getBudgetPersistenceProvider,
  getHostBudgetPersistenceProvider,
  getHostPersistenceGateway,
  resetBudgetPersistenceProvider,
} from "../apps/web/src/features/persistence/index.js";
import { browserLocalStoragePersistenceGateway } from "../apps/web/src/features/persistence/browserLocalStoragePersistenceGateway.js";

const hostGateway: AppPersistenceGateway = {
  ...browserLocalStoragePersistenceGateway,
  metadata: {
    kind: "sqlite-adapter",
    label: "Host-provided SQLite gateway",
    description: "Synthetic host-provided gateway used by v1.40 validation.",
    isProductionPersistence: false,
  },
};

try {
  validateBrowserFallbackWithoutHostGateway();
  validateHostGatewayIsConfiguredBeforeRuntimeUse();
  validateMainBootstrapsHostPersistenceBeforeRendering();
  validateHostBootstrapDoesNotImportSQLiteRepositories();

  console.log("v1.40 host-provided persistence gateway validation passed");
} finally {
  delete (globalThis as typeof globalThis & { window?: unknown }).window;
  resetBudgetPersistenceProvider();
}

function validateBrowserFallbackWithoutHostGateway(): void {
  resetBudgetPersistenceProvider();
  (globalThis as typeof globalThis & { window: Record<string, unknown> }).window = {};

  assert.equal(
    getHostBudgetPersistenceProvider(),
    null,
    "missing host provider should return null",
  );

  assert.equal(
    getHostPersistenceGateway(),
    null,
    "legacy host gateway alias should also return null",
  );

  assert.equal(
    bootstrapHostBudgetPersistenceProvider(),
    null,
    "bootstrap should not configure anything when no host provider is supplied",
  );

  assert.equal(
    bootstrapHostPersistenceGateway(),
    null,
    "legacy bootstrap alias should remain compatible",
  );

  assert.equal(
    getBudgetPersistenceProvider().metadata.kind,
    "browser-local-storage",
    "browser fallback should remain localStorage without a host provider",
  );
}

function validateHostGatewayIsConfiguredBeforeRuntimeUse(): void {
  resetBudgetPersistenceProvider();
  (globalThis as typeof globalThis & { window: Record<string, unknown> }).window = {
    __BUDGET_APP_PERSISTENCE_GATEWAY__: hostGateway,
  };

  assert.equal(
    getHostBudgetPersistenceProvider(),
    hostGateway,
    "host provider should be read from the legacy runtime global",
  );

  assert.equal(
    getHostPersistenceGateway(),
    hostGateway,
    "legacy host gateway alias should remain compatible",
  );

  assert.equal(
    bootstrapHostBudgetPersistenceProvider(),
    hostGateway,
    "bootstrap should return the configured host provider",
  );

  assert.equal(
    getBudgetPersistenceProvider().metadata.kind,
    "sqlite-adapter",
    "no-argument provider selection should use the host-provided SQLite provider after bootstrap",
  );

  assert.equal(
    getAppPersistenceGateway().accountRegisters,
    hostGateway.accountRegisters,
    "legacy gateway selection should delegate to the active provider",
  );
}

function validateMainBootstrapsHostPersistenceBeforeRendering(): void {
  const source = readFileSync("apps/web/src/main.tsx", "utf8");
  const bootstrapIndex = source.indexOf("bootstrapHostBudgetPersistenceProvider();");
  const applicationRenderIndex = source.indexOf("<App />");

  assert.ok(
    bootstrapIndex >= 0,
    "main.tsx should call bootstrapHostBudgetPersistenceProvider",
  );
  assert.ok(applicationRenderIndex >= 0, "main.tsx should still render the application");
  assert.ok(
    bootstrapIndex < applicationRenderIndex,
    "host persistence bootstrap must run before React renders",
  );
}

function validateHostBootstrapDoesNotImportSQLiteRepositories(): void {
  const filesToCheck = [
    "apps/web/src/main.tsx",
    "apps/web/src/features/persistence/hostPersistenceGateway.ts",
  ];

  for (const file of filesToCheck) {
    const source = readFileSync(file, "utf8");

    assert.doesNotMatch(
      source,
      /Sqlite[A-Z].*Repository|better-sqlite3|createDatabase|resetDatabase/,
      `${file} should not import or construct concrete SQLite repositories in the browser bundle`,
    );
  }
}
