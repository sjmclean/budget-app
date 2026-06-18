import { createDatabase } from "../packages/database/src/db.js";
import { MigrationRunner } from "../packages/application/src/MigrationRunner.js";
import { SqliteSchemaMigrationRepository } from "../packages/repository/src/SqliteSchemaMigrationRepository.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");
  const repo = new SqliteSchemaMigrationRepository(db);
  const runner = new MigrationRunner(repo);

  const firstRun = await runner.runPending([
    { version: 11, name: "backend hardening", up: () => undefined }
  ]);

  if (firstRun.length !== 1 || firstRun[0] !== 11) {
    throw new Error(`Expected migration 11 to run once, got ${JSON.stringify(firstRun)}`);
  }

  const records = await repo.findByVersion("11");
  if (records.length !== 1) throw new Error(`Expected 1 migration record, got ${records.length}`);

  const secondRun = await runner.runPending([
    { version: 11, name: "backend hardening", up: () => undefined }
  ]);

  if (secondRun.length !== 0) {
    throw new Error(`Expected already-applied migration to be skipped, got ${JSON.stringify(secondRun)}`);
  }

  console.log("PASS: pending migration applied");
  console.log("PASS: applied migration recorded");
  console.log("PASS: already-applied migration skipped");
  console.log("v1.1 migration runner OK");
}

main();
