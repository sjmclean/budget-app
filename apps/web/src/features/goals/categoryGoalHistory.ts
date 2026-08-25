import type { CategoryGoal } from "../../../../../packages/types/src/CategoryGoal";
import {
  applicationHistory,
  createCategoryGoalCommand,
  deleteCategoryGoalCommand,
  updateCategoryGoalCommand,
  type ApplicationHistoryContext,
  type ApplicationHistoryService,
  type UndoRedoResult,
} from "../history";

export interface CategoryGoalHistoryService {
  createCategoryGoal(goal: CategoryGoal): Promise<UndoRedoResult>;
  updateCategoryGoal(goal: CategoryGoal): Promise<UndoRedoResult>;
  deleteCategoryGoal(input: { budgetId: string; categoryId: string }): Promise<UndoRedoResult>;
}

export function createCategoryGoalHistoryService(
  history: ApplicationHistoryService<ApplicationHistoryContext> = applicationHistory,
): CategoryGoalHistoryService {
  return {
    createCategoryGoal: (goal) => history.execute(goal.budgetId, createCategoryGoalCommand(goal)),
    updateCategoryGoal: (goal) => history.execute(goal.budgetId, updateCategoryGoalCommand(goal)),
    deleteCategoryGoal: (input) => history.execute(input.budgetId, deleteCategoryGoalCommand(input)),
  };
}

export const categoryGoalHistory = createCategoryGoalHistoryService();
