import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { existsSync, readFileSync } from "node:fs";
import {
  DEFAULT_HOSTED_SCHEMA_MIGRATIONS,
  HOSTED_SCHEMA_VERSION,
  runHostedSchemaMigrations,
} from "../apps/server/src/hostedSchemaMigrations.mjs";

const database = new Database(":memory:");
await runHostedSchemaMigrations(database, {
  migrations: DEFAULT_HOSTED_SCHEMA_MIGRATIONS.slice(0, 3),
  backupBeforeMigration: false,
});

const retiredTables = [
  "budget_import_scheduled_transaction_tags",
  "budget_import_scheduled_transaction_splits",
  "budget_import_scheduled_transactions",
  "budget_import_transaction_tag_assignments",
  "budget_import_transaction_tags",
  "budget_import_transaction_splits",
  "budget_import_transactions",
  "budget_import_month_views",
  "budget_import_account_aggregates",
  "budget_import_categories",
  "budget_import_payees",
  "budget_import_accounts",
  "budget_import_sessions",
  "budget_engine_generations",
];
for (const table of retiredTables) {
  database.exec(`CREATE TABLE ${table} (id TEXT)`);
}
database.prepare("INSERT INTO budget_engine_generations (id) VALUES (?)").run("legacy");

let backupCalled = false;
const result = await runHostedSchemaMigrations(database, {
  databasePath: "shared-budget.sqlite",
  backup: async () => {
    backupCalled = true;
  },
});

assert.equal(HOSTED_SCHEMA_VERSION, 4);
assert.deepEqual(result.applied, [4]);
assert.equal(backupCalled, true, "destructive migration must request a backup");
for (const table of retiredTables) {
  assert.equal(
    database.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(table),
    undefined,
    `${table} should be removed`,
  );
}
assert.ok(database.prepare(
  "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'hosted_users'",
).get());
assert.ok(database.prepare(
  "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'replication_generations'",
).get());

database.close();

for (const module of [
  "budgetEngineStore.mjs",
  "budgetImportStore.mjs",
  "budgetLifecycleStore.mjs",
  "budgetReferenceDataStore.mjs",
  "budgetScheduledTransactionStore.mjs",
]) {
  assert.equal(
    existsSync(new URL(`../apps/server/src/${module}`, import.meta.url)),
    false,
    `${module} should be physically removed`,
  );
}
const serverSource = readFileSync(
  new URL("../apps/server/src/server.mjs", import.meta.url),
  "utf8",
);
assert.doesNotMatch(serverSource, /budget(?:Engine|Import|Lifecycle|ReferenceData|ScheduledTransaction)Store/);
assert.match(serverSource, /url\.pathname\.startsWith\("\/api\/budget-engine\/"\)/);

console.log("Milestone 4 hosted schema removal passed.");
