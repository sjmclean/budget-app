import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteBudgetMetadataRepository } from "../packages/repository/src/SqliteBudgetMetadataRepository.js";
import { MetadataApplicationService } from "../packages/application/src/MetadataApplicationService.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();

  const db = createDatabase("Test.budget");

  const budgetRepo = new SqliteBudgetRepository(db);
  const metadataRepo = new SqliteBudgetMetadataRepository(db);
  const metadataService = new MetadataApplicationService(metadataRepo);

  const budget = createBudget("Household Budget");
  await budgetRepo.create(budget);

  console.log(await metadataService.ensureMetadata(budget.id));
  console.log(await metadataService.markOpened(budget.id));
}

main();
