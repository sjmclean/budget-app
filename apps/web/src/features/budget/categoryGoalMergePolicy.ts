import type { CategoryGoal } from "../../../../../packages/types/src/CategoryGoal";

export const CATEGORY_GOAL_MERGE_CONFLICT_MESSAGE =
  "These categories both have Goals. Remove one Goal before merging the categories.";

export function planCategoryGoalMerge(input: {
  budgetId: string;
  sourceCategoryId: string;
  targetCategoryId: string;
  sourceGoal: CategoryGoal | null;
  targetGoal: CategoryGoal | null;
}): CategoryGoal | null {
  if (input.sourceGoal && input.targetGoal) {
    throw new Error(CATEGORY_GOAL_MERGE_CONFLICT_MESSAGE);
  }
  if (!input.sourceGoal) return null;
  if (
    input.sourceGoal.budgetId !== input.budgetId ||
    input.sourceGoal.categoryId !== input.sourceCategoryId
  ) {
    throw new Error("The source Category Goal does not belong to the category being merged.");
  }
  return { ...input.sourceGoal, categoryId: input.targetCategoryId };
}
