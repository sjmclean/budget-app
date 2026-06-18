import { BudgetMonth } from "../../../types/src/BudgetMonth.js";
import { CategoryMonth } from "../../../types/src/CategoryMonth.js";
import { calculateReadyToBudget } from "../calculations/calculateReadyToBudget.js";

export interface BudgetEngineSnapshot {
  budgetMonth: BudgetMonth;
  categoryMonths: CategoryMonth[];
}

export function recalculateBudgetMonth(
  snapshot: BudgetEngineSnapshot,
): BudgetMonth {
  const assigned = snapshot.categoryMonths.reduce(
    (sum, categoryMonth) => sum + categoryMonth.assigned,
    0,
  );
  const activity = snapshot.categoryMonths.reduce(
    (sum, categoryMonth) => sum + categoryMonth.activity,
    0,
  );
  return {
    ...snapshot.budgetMonth,
    assigned,
    activity,
    readyToBudget: calculateReadyToBudget(
      snapshot.budgetMonth.income,
      assigned,
    ),
    updatedAt: new Date(),
  };
}
