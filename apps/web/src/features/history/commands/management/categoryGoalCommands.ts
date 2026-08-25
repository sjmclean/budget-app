import type { CategoryGoal } from "../../../../../../../packages/types/src/CategoryGoal";
import type { ApplicationHistoryContext } from "../../applicationHistory";
import type { UndoableCommand } from "../../undoRedo";

function goals(context: ApplicationHistoryContext) {
  return context.persistence.categoryGoals;
}

function requireScope(
  context: ApplicationHistoryContext,
  goal: Pick<CategoryGoal, "budgetId" | "categoryId">,
  categoryId: string,
): void {
  if (goal.budgetId !== context.budgetId || goal.categoryId !== categoryId) {
    throw new Error("Category Goal history scope does not match the active budget and category.");
  }
}

async function replace(
  context: ApplicationHistoryContext,
  categoryId: string,
  expected: CategoryGoal | null,
  replacement: CategoryGoal | null,
): Promise<CategoryGoal | null> {
  return goals(context).replaceCategoryGoalHistoryState({
    budgetId: context.budgetId,
    categoryId,
    expected,
    replacement,
  });
}

export function createCategoryGoalCommand(
  intended: CategoryGoal,
): UndoableCommand<ApplicationHistoryContext> {
  const requested = { ...intended };
  let after: CategoryGoal | null = null;
  return {
    id: `create-category-goal:${requested.categoryId}`,
    label: "Create goal",
    async execute(context) {
      requireScope(context, requested, requested.categoryId);
      after = await replace(context, requested.categoryId, null, requested);
      if (!after) throw new Error("Created Category Goal could not be recaptured.");
    },
    async undo(context) {
      if (!after) throw new Error("Create Goal command has no captured state.");
      requireScope(context, after, requested.categoryId);
      await replace(context, requested.categoryId, after, null);
    },
    async redo(context) {
      if (!after) throw new Error("Create Goal command has no captured state.");
      requireScope(context, after, requested.categoryId);
      await replace(context, requested.categoryId, null, after);
    },
  };
}

export function updateCategoryGoalCommand(
  intended: CategoryGoal,
): UndoableCommand<ApplicationHistoryContext> {
  const requested = { ...intended };
  let before: CategoryGoal | null = null;
  let after: CategoryGoal | null = null;
  return {
    id: `update-category-goal:${requested.categoryId}:${Date.now()}`,
    label: "Update goal",
    async execute(context) {
      requireScope(context, requested, requested.categoryId);
      before = await goals(context).getCategoryGoal({
        budgetId: context.budgetId,
        categoryId: requested.categoryId,
      });
      if (!before) throw new Error("Category Goal was not found.");
      requireScope(context, before, requested.categoryId);
      if (before.id !== requested.id) {
        throw new Error("Category Goal update cannot change Goal identity.");
      }
      after = await replace(context, requested.categoryId, before, requested);
      if (!after) throw new Error("Updated Category Goal could not be recaptured.");
    },
    async undo(context) {
      if (!before || !after) throw new Error("Update Goal command has incomplete state.");
      requireScope(context, before, requested.categoryId);
      await replace(context, requested.categoryId, after, before);
    },
    async redo(context) {
      if (!before || !after) throw new Error("Update Goal command has incomplete state.");
      requireScope(context, before, requested.categoryId);
      await replace(context, requested.categoryId, before, after);
    },
  };
}

export function deleteCategoryGoalCommand(input: {
  readonly budgetId: string;
  readonly categoryId: string;
}): UndoableCommand<ApplicationHistoryContext> {
  const scope = { ...input };
  let before: CategoryGoal | null = null;
  return {
    id: `delete-category-goal:${scope.categoryId}:${Date.now()}`,
    label: "Delete goal",
    async execute(context) {
      if (context.budgetId !== scope.budgetId) {
        throw new Error("Category Goal history scope does not match the active budget.");
      }
      before = await goals(context).getCategoryGoal(scope);
      if (!before) throw new Error("Category Goal was not found.");
      requireScope(context, before, scope.categoryId);
      await replace(context, scope.categoryId, before, null);
    },
    async undo(context) {
      if (!before) throw new Error("Delete Goal command has no captured state.");
      requireScope(context, before, scope.categoryId);
      await replace(context, scope.categoryId, null, before);
    },
    async redo(context) {
      if (!before) throw new Error("Delete Goal command has no captured state.");
      requireScope(context, before, scope.categoryId);
      await replace(context, scope.categoryId, before, null);
    },
  };
}
