import { Goal } from "../../types/src/Goal.js";

export interface GoalRepository {
  create(goal: Goal): Promise<void>;
  update(goal: Goal): Promise<void>;
  findByBudget(budgetId: string): Promise<Goal[]>;
  findByCategory(categoryId: string): Promise<Goal[]>;
}
