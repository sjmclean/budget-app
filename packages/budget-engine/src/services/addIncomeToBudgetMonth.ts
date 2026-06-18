import { BudgetMonth } from "../../../types/src/BudgetMonth.js";
import { calculateReadyToBudget } from "../calculations/calculateReadyToBudget.js";

export function addIncomeToBudgetMonth(
  month: BudgetMonth,
  income: number,
): BudgetMonth {
  const updatedIncome = month.income + income;
  return {
    ...month,
    income: updatedIncome,
    readyToBudget: calculateReadyToBudget(updatedIncome, month.assigned),
    updatedAt: new Date(),
  };
}
