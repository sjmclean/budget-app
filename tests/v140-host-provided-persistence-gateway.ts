import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { AppPersistenceGateway } from "../apps/web/src/features/persistence/appPersistenceGateway.js";
import {
  bootstrapHostPersistenceGateway,
  getAppPersistenceGateway,
  getHostPersistenceGateway,
  resetAppPersistenceGateway,
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
  resetAppPersistenceGateway();
}

function validateBrowserFallbackWithoutHostGateway(): void {
  resetAppPersistenceGateway();
  (globalThis as typeof globalThis & { window: Record<string, unknown> }).window = {};

  assert.equal(
    getHostPersistenceGateway(),
    null,
    "missing host gateway should return null",
  );

  assert.equal(
    bootstrapHostPersistenceGateway(),
    null,
    "bootstrap should not configure anything when no host gateway is supplied",
  );

  assert.equal(
    getAppPersistenceGateway().metadata.kind,
    "browser-local-storage",
    "browser fallback should remain localStorage without a host gateway",
  );
}

function validateHostGatewayIsConfiguredBeforeRuntimeUse(): void {
  resetAppPersistenceGateway();
  (globalThis as typeof globalThis & { window: Record<string, unknown> }).window = {
    __BUDGET_APP_PERSISTENCE_GATEWAY__: hostGateway,
  };

  assert.equal(
    getHostPersistenceGateway(),
    hostGateway,
    "host gateway should be read from the runtime global",
  );

  assert.equal(
    bootstrapHostPersistenceGateway(),
    hostGateway,
    "bootstrap should return the configured host gateway",
  );

  assert.equal(
    getAppPersistenceGateway().metadata.kind,
    "sqlite-adapter",
    "no-argument gateway selection should use the host-provided SQLite gateway after bootstrap",
  );

  assert.equal(
    getAppPersistenceGateway().accountRegisters,
    hostGateway.accountRegisters,
    "runtime register persistence should come from the host-provided gateway",
  );
}

function validateMainBootstrapsHostPersistenceBeforeRendering(): void {
  const source = readFileSync("apps/web/src/main.tsx", "utf8");
  const bootstrapIndex = source.indexOf("bootstrapHostPersistenceGateway();");
  const renderIndex = source.indexOf("ReactDOM.createRoot");

  assert.ok(bootstrapIndex >= 0, "main.tsx should call bootstrapHostPersistenceGateway");
  assert.ok(renderIndex >= 0, "main.tsx should still render React");
  assert.ok(
    bootstrapIndex < renderIndex,
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
