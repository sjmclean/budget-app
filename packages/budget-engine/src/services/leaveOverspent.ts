import { BudgetMonth } from "../../../types/src/BudgetMonth.js";
import { CategoryMonth } from "../../../types/src/CategoryMonth.js";
import { calculateReadyToAssign } from "../calculations/calculateReadyToAssign.js";

export function leaveOverspent(
  nextBudgetMonth: BudgetMonth,
  overspentCategoryMonth: CategoryMonth
): BudgetMonth {
  if (overspentCategoryMonth.available >= 0) {
    return nextBudgetMonth;
  }

  const overspentAmount = Math.abs(overspentCategoryMonth.available);
  const updatedIncome = nextBudgetMonth.income - overspentAmount;

  return {
    ...nextBudgetMonth,
    income: updatedIncome,
    readyToAssign: calculateReadyToAssign(updatedIncome, nextBudgetMonth.assigned),
    updatedAt: new Date()
  };
}
