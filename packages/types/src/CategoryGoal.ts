import { CategoryGoalType } from "./CategoryGoalType.js";

export interface CategoryGoal {
  id: string;
  budgetId: string;
  categoryId: string;
  type: CategoryGoalType;
  targetAmount: number;
  targetMonth: string | null;
  createdAt: string;
  updatedAt: string;
}
