import { createDatabase } from "../packages/database/src/db.js";
import { createBudgetSettings } from "../packages/budget-engine/src/services/createBudgetSettings.js";
import { createAccountSettings } from "../packages/budget-engine/src/services/createAccountSettings.js";
import { createCategorySettings } from "../packages/budget-engine/src/services/createCategorySettings.js";
import { SqliteBudgetSettingsRepository } from "../packages/repository/src/SqliteBudgetSettingsRepository.js";
import { SqliteAccountSettingsRepository } from "../packages/repository/src/SqliteAccountSettingsRepository.js";
import { SqliteCategorySettingsRepository } from "../packages/repository/src/SqliteCategorySettingsRepository.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");

  const budgetRepo = new SqliteBudgetSettingsRepository(db);
  const accountRepo = new SqliteAccountSettingsRepository(db);
  const categoryRepo = new SqliteCategorySettingsRepository(db);

  const budgetSettings = createBudgetSettings("budget", "AUD", "$");
  const accountSettings = createAccountSettings("account", 1);
  const categorySettings = createCategorySettings("category");

  await budgetRepo.create(budgetSettings);
  await accountRepo.create(accountSettings);
  await categoryRepo.create(categorySettings);

  console.log(await budgetRepo.findByBudgetId("budget"));
  console.log(await accountRepo.findByAccountId("account"));
  console.log(await categoryRepo.findByCategoryId("category"));
}

main();
