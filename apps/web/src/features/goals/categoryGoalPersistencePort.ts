import type { CategoryGoal } from "../../../../../packages/types/src/CategoryGoal";

export interface CategoryGoalPersistencePort {
  getCategoryGoal(input: { budgetId: string; categoryId: string }): Promise<CategoryGoal | null>;
  listCategoryGoals(input: { budgetId: string }): Promise<readonly CategoryGoal[]>;
  createCategoryGoal(goal: CategoryGoal): Promise<CategoryGoal>;
  updateCategoryGoal(goal: CategoryGoal): Promise<CategoryGoal>;
  deleteCategoryGoal(input: { budgetId: string; categoryId: string }): Promise<CategoryGoal | null>;
  replaceCategoryGoalHistoryState(input: {
    budgetId: string;
    categoryId: string;
    expected: CategoryGoal | null;
    replacement: CategoryGoal | null;
  }): Promise<CategoryGoal | null>;
}
