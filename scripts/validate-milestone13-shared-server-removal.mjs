import { readFileSync, existsSync } from "node:fs";

const failures = [];
const read = (path) => readFileSync(path, "utf8");
const absent = [
  "apps/web/src/features/persistence/sharedServerStorageClient.ts",
  "apps/web/src/features/persistence/sharedServerKeyValueStorage.ts",
  "apps/web/src/features/persistence/sharedServerPersistenceProvider.ts",
  "apps/web/src/features/persistence/browserToSharedServerMigration.ts",
,
  "tests/v144-shared-server-key-value-storage.ts",
  "tests/v145-shared-server-persistence-provider.ts",
  "tests/v147-browser-to-shared-server-migration.ts",
  "tests/v153-shared-budget-automatic-refresh.ts",
  "tests/v154-shared-budget-optimistic-concurrency.ts",
  "tests/v155-shared-budget-server-sent-events.ts",
  "tests/v156-shared-runtime-persistence-routing.ts",
];
for (const path of absent) if (existsSync(path)) failures.push(`${path} still exists`);

const configured = read("apps/web/src/features/persistence/configuredPersistenceProvider.ts");
const provider = read("apps/web/src/features/persistence/budgetPersistenceProvider.ts");
const lifecycle = read("apps/web/src/features/persistence/persistenceProviderLifecycle.ts");
const settings = read("apps/web/src/pages/SettingsPage.tsx");
const server = read("apps/server/src/server.mjs");

for (const [name, text] of [["configured provider", configured], ["provider contract", provider], ["settings", settings]]) {
  if (text.includes("shared-server") || text.includes("SharedServer")) failures.push(`${name} still references shared-server runtime`);
}
if (provider.includes("watch?(")) failures.push("legacy provider watch contract still exists");
if (lifecycle.includes("provider.watch")) failures.push("lifecycle still installs the legacy provider watcher");
for (const token of ["/api/shared-budget/", "shared_storage", "revisionSubscribers", "RevisionConflictError"]) {
  if (server.includes(token)) failures.push(`server still contains ${token}`);
}
if (!settings.includes("Local-first synchronisation")) failures.push("Cloud settings were not converted to replication guidance");

if (failures.length) {
  console.error("Milestone 13 validation failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("Milestone 13 shared-server removal validation passed.");
