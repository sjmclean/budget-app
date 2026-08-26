import type { UndoRedoResult } from "../history";
import { roundMoney } from "../money/moneyExpression";
import type { BudgetMonthView } from "./budgetViewTypes";

export type GoalRecommendedAssignmentResult =
  | { performed: true; view: BudgetMonthView }
  | { performed: false; reason: "busy" | "failed" | "empty"; error?: string };

export interface GoalRecommendedAssignmentDependencies {
  flushPendingAssignments(): Promise<UndoRedoResult | null>;
  readBudgetView(): Promise<BudgetMonthView>;
  executeAssignment(input: {
    month: string;
    changes: Array<{
      categoryId: string;
      categoryName: string;
      originalAssigned: number;
      finalAssigned: number;
    }>;
  }): Promise<UndoRedoResult>;
}

function findCategory(view: BudgetMonthView, categoryId: string) {
  return view.categoryGroups
    .flatMap((group) => group.categories)
    .find((category) => category.id === categoryId);
}

export async function applyGoalRecommendedAssignment(
  input: { categoryId: string; month: string },
  dependencies: GoalRecommendedAssignmentDependencies,
): Promise<GoalRecommendedAssignmentResult> {
  const flushResult = await dependencies.flushPendingAssignments();
  if (flushResult && !flushResult.performed) {
    return { performed: false, reason: flushResult.reason, error: flushResult.error };
  }

  const currentView = await dependencies.readBudgetView();
  const category = findCategory(currentView, input.categoryId);
  const recommendation = category?.goal?.recommendedAssignment;

  if (!category || category.isArchived || recommendation === null || recommendation === undefined || recommendation <= 0) {
    return {
      performed: false,
      reason: "failed",
      error: "A recommended assignment is no longer available for this category.",
    };
  }

  const result = await dependencies.executeAssignment({
    month: input.month,
    changes: [{
      categoryId: category.id,
      categoryName: category.name,
      originalAssigned: category.assigned,
      finalAssigned: roundMoney(category.assigned + recommendation),
    }],
  });

  if (!result.performed) {
    return { performed: false, reason: result.reason, error: result.error };
  }

  return { performed: true, view: await dependencies.readBudgetView() };
}
