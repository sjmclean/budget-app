import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { createBudgetEngineStore } from "../apps/server/src/budgetEngineStore.mjs";
import { createBudgetImportStore } from "../apps/server/src/budgetImportStore.mjs";
import {
  createOperationalResilienceStore,
  assertDatabaseReadable,
  openResilientHostedDatabase,
} from "../apps/server/src/operationalResilienceStore.mjs";

const directory = mkdtempSync(join(tmpdir(), "budget-app-resilience-"));
const databasePath = join(directory, "hosted.sqlite");
const backupDirectory = join(directory, "backups");
let database = new Database(databasePath);
assert.equal(assertDatabaseReadable(database), true);
const engine = createBudgetEngineStore(database);
const importer = createBudgetImportStore(database, engine);
database.exec("CREATE TABLE resilience_probe (value TEXT NOT NULL)");
database.prepare("INSERT INTO resilience_probe (value) VALUES (?)").run("recoverable");

const abandoned = importer.begin({
  budgetId: "budget-abandoned",
  budgetName: "Abandoned",
  currency: "AUD",
});
database.prepare(
  "UPDATE budget_import_sessions SET updated_at = 1 WHERE generation_id = ?",
).run(abandoned.generationId);

const store = createOperationalResilienceStore(database, {
  Database,
  databasePath,
  backupDirectory,
  retentionCount: 2,
});
const cleanup = store.cleanupAbandoned(importer, 1_000);
assert.equal(cleanup.removedGenerationCount, 1);
assert.equal(
  database.prepare("SELECT 1 FROM budget_import_sessions WHERE generation_id = ?")
    .get(abandoned.generationId),
  undefined,
);

await store.createVerifiedBackup("test-one");
await store.createVerifiedBackup("test-two");
await store.createVerifiedBackup("test-three");
assert.equal(
  readdirSync(backupDirectory).filter((name) => name.endsWith(".sqlite")).length,
  2,
);
const reused = await store.createVerifiedBackup("startup");
assert.equal(reused.outcome, "reused");
assert.equal(
  readdirSync(backupDirectory).filter((name) => name.endsWith(".sqlite")).length,
  2,
);
writeFileSync(join(backupDirectory, "abandoned.sqlite.partial-wal"), "");
const constrained = createOperationalResilienceStore(database, {
  Database,
  databasePath,
  backupDirectory,
  retentionCount: 2,
  capacityProvider: () => 0,
  recentBackupMaximumAgeMs: 1,
});
assert.equal(
  readdirSync(backupDirectory).includes("abandoned.sqlite.partial-wal"),
  false,
);
const skipped = await constrained.createVerifiedBackup("scheduled");
assert.equal(skipped.outcome, "skipped");
assert.equal(skipped.reason, "insufficient-free-space");
assert.equal(store.diagnostics("budget-abandoned").databaseIntegrity.ok, true);

database.close();
writeFileSync(databasePath, "not a sqlite database");
const reopened = openResilientHostedDatabase(Database, {
  databasePath,
  backupDirectory,
});
database = reopened.database;
assert.equal(reopened.startupRecovery?.recovered, true);
assert.equal(
  database.prepare("SELECT value FROM resilience_probe").get().value,
  "recoverable",
);
database.close();
rmSync(directory, { recursive: true, force: true });

console.log("Milestone 3 operational resilience passed: verified retention, cleanup, and corruption recovery.");
