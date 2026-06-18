import { createDatabase } from "../packages/database/src/db.js";
import {
  createImportRun,
  completeImportRun,
  createImportMap,
} from "../packages/budget-engine/src/services/createImportRun.js";
import { ImportSource } from "../packages/types/src/ImportRun.js";
import { SqliteImportRunRepository } from "../packages/repository/src/SqliteImportRunRepository.js";
import { SqliteImportMapRepository } from "../packages/repository/src/SqliteImportMapRepository.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");

  const runRepo = new SqliteImportRunRepository(db);
  const mapRepo = new SqliteImportMapRepository(db);

  const run = createImportRun({
    budgetId: "budget",
    userId: "user",
    source: ImportSource.YNAB4,
    sourceFileName: "Budget.yfull",
    summary: { rows: 10 },
  });

  await runRepo.create(run);

  const completed = completeImportRun(run, { imported: 10 });
  await runRepo.update(completed);

  const map = createImportMap({
    importRunId: run.id,
    sourceEntityType: "YNAB4Account",
    sourceEntityId: "old-account-id",
    targetEntityType: "Account",
    targetEntityId: "new-account-id",
  });

  await mapRepo.create(map);

  console.log(await runRepo.findByBudgetId("budget"));
  console.log(await mapRepo.findByImportRunId(run.id));
}

main();
