import { createDatabase } from "../packages/database/src/db.js";
import { createBudget } from "../packages/budget-engine/src/services/createBudget.js";
import { createCategoryGroup } from "../packages/budget-engine/src/services/createCategoryGroup.js";
import { createCategory } from "../packages/budget-engine/src/services/createCategory.js";
import { GoalType } from "../packages/types/src/GoalType.js";
import { SqliteBudgetRepository } from "../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteCategoryGroupRepository } from "../packages/repository/src/SqliteCategoryGroupRepository.js";
import { SqliteCategoryRepository } from "../packages/repository/src/SqliteCategoryRepository.js";
import { SqliteGoalRepository } from "../packages/repository/src/SqliteGoalRepository.js";
import { GoalApplicationService } from "../packages/application/src/GoalApplicationService.js";
import { resetDatabase } from "./reset.js";

async function main() {
  resetDatabase();

  const db = createDatabase("Test.budget");

  const budgetRepo = new SqliteBudgetRepository(db);
  const groupRepo = new SqliteCategoryGroupRepository(db);
  const categoryRepo = new SqliteCategoryRepository(db);
  const goalRepo = new SqliteGoalRepository(db);
  const goalService = new GoalApplicationService(goalRepo);

  const budget = createBudget("Household Budget");
  await budgetRepo.create(budget);

  const group = createCategoryGroup(budget.id, "Savings");
  await groupRepo.create(group);

  const emergency = createCategory(group.id, "Emergency Fund");
  await categoryRepo.create(emergency);

  const goal = await goalService.create({
    budgetId: budget.id,
    categoryId: emergency.id,
    type: GoalType.TargetDate,
    name: "Emergency Fund",
    targetAmount: 1000000,
    targetDate: "2026-12-01"
  });

  console.log(goal);
  console.log(goalService.progress(goal, 250000, "2026-06-01"));
  console.log(await goalService.getBudgetGoals(budget.id));
}

main();
