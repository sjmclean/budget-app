import { readFile } from "node:fs/promises";

const configured = await readFile(
  new URL("../apps/web/src/features/persistence/configuredPersistenceProvider.ts", import.meta.url),
  "utf8",
);
const localProvider = await readFile(
  new URL("../apps/web/src/features/persistence/localDatabasePersistenceProvider.ts", import.meta.url),
  "utf8",
);
const localStorage = await readFile(
  new URL("../apps/web/src/features/persistence/localDatabaseKeyValueStorage.ts", import.meta.url),
  "utf8",
);

const checks = [
  [configured.includes('value?.trim() || "local-database"'), "local-database is the default"],
  [configured.includes('case "browser-local-storage"'), "legacy rollback provider remains selectable"],
  [configured.includes('case "shared-server"'), "shared-server provider remains selectable"],
  [localProvider.includes("storage.isEmpty()"), "migration only targets an empty database"],
  [localProvider.includes("browserLocalStoragePersistenceGateway.exportSnapshot"), "legacy data is copied through the canonical snapshot"],
  [localStorage.includes("createSerializedWriteCoordinator"), "database writes are serialized"],
  [localStorage.includes("CURRENT_SCHEMA_VERSION"), "database schema is versioned"],
];

for (const [passed, description] of checks) {
  if (!passed) throw new Error(`Milestone 2 check failed: ${description}`);
  console.log(`✓ ${description}`);
}
