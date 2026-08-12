import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const configured = read("apps/web/src/features/persistence/configuredPersistenceProvider.ts");
const factory = read("apps/web/src/features/persistence/budgetPersistenceProviderFactory.ts");
const localProvider = read("apps/web/src/features/persistence/localDatabasePersistenceProvider.ts");
const providerContract = read("apps/web/src/features/persistence/budgetPersistenceProvider.ts");
const activeStorage = read("apps/web/src/features/persistence/activeKeyValueStorage.ts");

assert.equal(
  existsSync(join(root, "apps/web/src/features/persistence/browserLocalStoragePersistenceGateway.ts")),
  false,
  "the browser localStorage provider must be removed",
);

assert.equal(
  existsSync(join(root, "apps/web/src/features/persistence/legacyBrowserSnapshotReader.ts")),
  false,
  "the legacy browser snapshot migration reader must be removed",
);

assert.doesNotMatch(configured, /browser-local-storage|VITE_BUDGET_PERSISTENCE_MODE/);
assert.match(configured, /createLocalDatabasePersistenceProvider/);
assert.doesNotMatch(factory, /browserLocalStorage|backend\?/);
assert.match(factory, /has not been configured/);
assert.doesNotMatch(providerContract, /browser-local-storage/);
assert.doesNotMatch(activeStorage, /browserLocalStorageKeyValueStorage/);
assert.doesNotMatch(localProvider, /readLegacyBrowserPersistenceSnapshot|migrateLegacyBrowserData/);
assert.doesNotMatch(localProvider, /browserLocalStoragePersistenceGateway/);

console.log("Milestone 15 browser runtime removal validation passed.");
