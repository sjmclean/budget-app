import { createDatabase } from "../packages/database/src/db.js";
import { createSchemaMigration } from "../packages/budget-engine/src/services/createSchemaMigration.js";
import { SqliteSchemaMigrationRepository } from "../packages/repository/src/SqliteSchemaMigrationRepository.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");
  const repo = new SqliteSchemaMigrationRepository(db);

  await repo.create(createSchemaMigration(1, "initial schema"));
  await repo.create(createSchemaMigration(10, "settings and configuration"));

  console.log(await repo.findByVersion("10"));
}

main();
