import { calculateCategoryGoalProgress } from "../../../../../packages/budget-engine/src/services/calculateCategoryGoalProgress";
import type { CategoryGoal } from "../../../../../packages/types/src/CategoryGoal";
import { isCreditCardPaymentCategory, isCreditCardPaymentGroup } from "./creditCardPaymentCategories";
import type { BudgetMonthView } from "./budgetViewTypes";

export function projectCategoryGoalsOntoBudgetView(
  view: BudgetMonthView,
  selectedMonth: string,
  goals: readonly CategoryGoal[],
): BudgetMonthView {
  const goalByCategoryId = new Map(
    goals
      .filter((goal) => goal.budgetId === view.budgetId)
      .map((goal) => [goal.categoryId, goal] as const),
  );

  return {
    ...view,
    categoryGroups: view.categoryGroups.map((group) => ({
      ...group,
      categories: group.categories.map((category) => {
        const goal = goalByCategoryId.get(category.id);
        if (
          !goal ||
          isCreditCardPaymentGroup(group.id) ||
          isCreditCardPaymentCategory(category.id)
        ) {
          const { goal: _ignored, ...withoutGoal } = category;
          return withoutGoal;
        }
        return {
          ...category,
          goal: calculateCategoryGoalProgress({
            goal,
            selectedMonth,
            assigned: category.assigned,
            available: category.available,
          }),
        };
      }),
    })),
  };
}
