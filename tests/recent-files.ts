import { createDatabase } from "../packages/database/src/db.js";
import { createRecentFile } from "../packages/budget-engine/src/services/createRecentFile.js";
import { SqliteRecentFileRepository } from "../packages/repository/src/SqliteRecentFileRepository.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");
  const repo = new SqliteRecentFileRepository(db);

  await repo.create(
    createRecentFile("user", "/Budgets/Household.budget", "Household"),
  );

  console.log(await repo.findByUserId("user"));
}

main();
