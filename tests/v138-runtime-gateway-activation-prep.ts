import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { AppPersistenceGateway } from "../apps/web/src/features/persistence/appPersistenceGateway.js";
import {
  configureAppPersistenceGateway,
  getAppPersistenceGateway,
  resetAppPersistenceGateway,
} from "../apps/web/src/features/persistence/appPersistenceGatewayFactory.js";
import { browserLocalStoragePersistenceGateway } from "../apps/web/src/features/persistence/browserLocalStoragePersistenceGateway.js";

const sqliteLikeGateway: AppPersistenceGateway = {
  ...browserLocalStoragePersistenceGateway,
  metadata: {
    kind: "sqlite-adapter",
    label: "SQLite runtime activation candidate",
    description: "Synthetic SQLite gateway used by v1.38 runtime activation prep validation.",
    isProductionPersistence: false,
  },
};

try {
  validateDefaultGatewayRemainsBrowserLocalStorage();
  validateConfiguredGatewayBecomesRuntimeDefault();
  validateExplicitBackendSelectionStillWorks();
  validateUiModulesDoNotCaptureOldGatewayAtModuleLoad();

  console.log("v1.38 runtime gateway activation prep validation passed");
} finally {
  resetAppPersistenceGateway();
}

function validateDefaultGatewayRemainsBrowserLocalStorage(): void {
  resetAppPersistenceGateway();

  assert.equal(
    getAppPersistenceGateway().metadata.kind,
    "browser-local-storage",
    "unconfigured runtime should continue to default to browser localStorage",
  );
}

function validateConfiguredGatewayBecomesRuntimeDefault(): void {
  configureAppPersistenceGateway(sqliteLikeGateway);

  assert.equal(
    getAppPersistenceGateway().metadata.kind,
    "sqlite-adapter",
    "configured runtime gateway should become the no-argument gateway",
  );

  assert.equal(
    getAppPersistenceGateway().accounts,
    sqliteLikeGateway.accounts,
    "configured runtime gateway should supply accounts persistence",
  );

  assert.equal(
    getAppPersistenceGateway().accountRegisters,
    sqliteLikeGateway.accountRegisters,
    "configured runtime gateway should supply register persistence",
  );
}

function validateExplicitBackendSelectionStillWorks(): void {
  assert.equal(
    getAppPersistenceGateway("browser-local-storage").metadata.kind,
    "browser-local-storage",
    "explicit browser backend selection should bypass configured runtime gateway",
  );

  assert.equal(
    getAppPersistenceGateway("sqlite-adapter", sqliteLikeGateway).metadata.kind,
    "sqlite-adapter",
    "explicit SQLite backend selection should still require and return the supplied SQLite gateway",
  );

  assert.throws(
    () => getAppPersistenceGateway("sqlite-adapter"),
    /SQLite gateway requested but no sqlite gateway instance was supplied/,
    "explicit SQLite selection without a gateway should remain guarded",
  );
}

function validateUiModulesDoNotCaptureOldGatewayAtModuleLoad(): void {
  const filesToCheck = [
    "apps/web/src/pages/AccountRegisterPage.tsx",
    "apps/web/src/layouts/Sidebar.tsx",
    "apps/web/src/components/accounts/ScheduledTransactionsPanel.tsx",
    "apps/web/src/features/budget/useBudgetView.ts",
    "apps/web/src/features/budget/useBudgetWorkspace.ts",
  ];

  for (const file of filesToCheck) {
    const source = readFileSync(file, "utf8");

    assert.doesNotMatch(
      source,
      /^const\s+\w*Persistence\w*\s*=\s*getAppPersistenceGateway\(/m,
      `${file} should not capture persistence directly at module load`,
    );

    assert.doesNotMatch(
      source,
      /^const\s+persistenceGateway\s*=\s*getAppPersistenceGateway\(\);/m,
      `${file} should not capture the gateway at module load`,
    );
  }
}
