import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createCategoryGroup } from "../packages/budget-engine/src/services/createCategoryGroup.js";
import { createCategory } from "../packages/budget-engine/src/services/createCategory.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteCategoryGroupRepository } from "../packages/repository/src/SqliteCategoryGroupRepository.js";
import { SqliteCategoryRepository } from "../packages/repository/src/SqliteCategoryRepository.js";
import { SqliteBudgetMonthRepository } from "../packages/repository/src/SqliteBudgetMonthRepository.js";
import { SqliteCategoryMonthRepository } from "../packages/repository/src/SqliteCategoryMonthRepository.js";
import { BudgetApplicationService } from "../packages/application/src/BudgetApplicationService.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();
  const db = createDatabase("Test.budget");
  const budgetRepo = new SqliteBudgetRepository(db);
  const groupRepo = new SqliteCategoryGroupRepository(db);
  const categoryRepo = new SqliteCategoryRepository(db);
  const budgetMonthRepo = new SqliteBudgetMonthRepository(db);
  const categoryMonthRepo = new SqliteCategoryMonthRepository(db);
  const budgetService = new BudgetApplicationService(
    budgetMonthRepo,
    categoryMonthRepo,
  );

  const budget = createBudget("Household Budget");
  await budgetRepo.create(budget);
  const food = createCategoryGroup(budget.id, "Food");
  await groupRepo.create(food);
  const groceries = createCategory(food.id, "Groceries");
  await categoryRepo.create(groceries);

  await budgetService.postIncomeToReadyToBudget(budget.id, "2026-06", 400000);
  const result = await budgetService.assignMoney(
    budget.id,
    "2026-06",
    groceries.id,
    50000,
  );

  console.log(result);
}
main();
