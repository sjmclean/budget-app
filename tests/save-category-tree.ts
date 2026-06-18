import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createCategoryGroup } from "../packages/budget-engine/src/services/createCategoryGroup.js";
import { createCategory } from "../packages/budget-engine/src/services/createCategory.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteCategoryGroupRepository } from "../packages/repository/src/SqliteCategoryGroupRepository.js";
import { SqliteCategoryRepository } from "../packages/repository/src/SqliteCategoryRepository.js";
import { resetDatabase } from "./reset.js";
async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");
  const budgetRepo = new SqliteBudgetRepository(db);
  const groupRepo = new SqliteCategoryGroupRepository(db);
  const categoryRepo = new SqliteCategoryRepository(db);
  const budget = createBudget("Household Budget");
  await budgetRepo.create(budget);
  const housing = createCategoryGroup(budget.id, "Housing");
  await groupRepo.create(housing);
  await categoryRepo.create(createCategory(housing.id, "Rent"));
  console.log(await groupRepo.findByBudget(budget.id));
  console.log(await categoryRepo.findByGroup(housing.id));
}
main();
