import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { createBudgetEngineStore } from "../apps/server/src/budgetEngineStore.mjs";
import { createBudgetImportStore } from "../apps/server/src/budgetImportStore.mjs";
import { createBudgetReferenceDataStore } from
  "../apps/server/src/budgetReferenceDataStore.mjs";
import { createBudgetScheduledTransactionStore } from
  "../apps/server/src/budgetScheduledTransactionStore.mjs";
import {
  HOSTED_SCHEMA_VERSION,
  runHostedSchemaMigrations,
} from "../apps/server/src/hostedSchemaMigrations.mjs";

const database = new Database(":memory:");
const engine = createBudgetEngineStore(database);
createBudgetImportStore(database, engine);
createBudgetScheduledTransactionStore(database);
createBudgetReferenceDataStore(database, engine);

const backupDestinations = [];
const first = await runHostedSchemaMigrations(database, {
  databasePath: "existing.sqlite",
  backupDirectory: tmpdir(),
  backup: async (destination) => {
    backupDestinations.push(destination);
  },
  now: () => new Date("2026-07-29T01:02:03.000Z"),
});
assert.equal(first.previousVersion, 0);
assert.equal(first.currentVersion, HOSTED_SCHEMA_VERSION);
assert.deepEqual(first.applied, [1, 2, 3]);
assert.equal(backupDestinations.length, 1);
assert.match(backupDestinations[0], /pre-migration-v3/);

const second = await runHostedSchemaMigrations(database, {
  backup: async () => assert.fail("an up-to-date schema must not be backed up"),
});
assert.deepEqual(second.applied, []);
assert.equal(second.currentVersion, HOSTED_SCHEMA_VERSION);
database.prepare(
  "UPDATE hosted_schema_migrations SET checksum = 'tampered' WHERE version = 1",
).run();
await assert.rejects(
  runHostedSchemaMigrations(database, { backupBeforeMigration: false }),
  (error) => error.code === "HOSTED_MIGRATION_HISTORY_MISMATCH",
);
database.close();

const rollbackDatabase = new Database(":memory:");
await assert.rejects(
  runHostedSchemaMigrations(rollbackDatabase, {
    backupBeforeMigration: false,
    migrations: [{
      version: 1,
      name: "create-example",
      description: "Create the example migration table.",
      up(db) {
        db.exec("CREATE TABLE migration_example (id INTEGER PRIMARY KEY, value TEXT)");
      },
    }, {
      version: 2,
      name: "fail-example",
      description: "Prove that failed migration writes roll back.",
      up(db) {
        db.prepare(
          "INSERT INTO migration_example (id, value) VALUES (1, 'must-roll-back')",
        ).run();
        throw new Error("injected migration failure");
      },
    }],
  }),
  (error) =>
    error.code === "HOSTED_MIGRATION_FAILED" &&
    error.cause?.message === "injected migration failure",
);
assert.deepEqual(
  rollbackDatabase.prepare(
    "SELECT version FROM hosted_schema_migrations ORDER BY version",
  ).all(),
  [{ version: 1 }],
);
assert.equal(
  rollbackDatabase.prepare("SELECT COUNT(*) AS count FROM migration_example").get().count,
  0,
  "writes from a failed migration must roll back",
);

rollbackDatabase.prepare(`
  INSERT INTO hosted_schema_migrations (version, name, checksum, applied_at)
  VALUES (3, 'future-version', 'future', '2026-07-29T00:00:00.000Z')
`).run();
await assert.rejects(
  runHostedSchemaMigrations(rollbackDatabase, {
    backupBeforeMigration: false,
    migrations: [{
      version: 1,
      name: "create-example",
      description: "Create the example migration table.",
      up() {},
    }, {
      version: 2,
      name: "fail-example",
      description: "Prove that failed migration writes roll back.",
      up() {},
    }],
  }),
  (error) => error.code === "HOSTED_SCHEMA_TOO_NEW",
);
rollbackDatabase.close();

console.log(
  "Milestone 3 hosted schema migrations passed: baseline, backup, idempotency, rollback, and compatibility refusal.",
);
