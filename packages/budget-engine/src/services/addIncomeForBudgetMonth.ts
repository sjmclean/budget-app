import { BudgetMonth } from "../../../types/src/BudgetMonth.js";
import { calculateReadyToAssign } from "../calculations/calculateReadyToAssign.js";

export function addIncomeForBudgetMonth(month: BudgetMonth, income: number): BudgetMonth {
  const updatedIncome = month.income + income;
  return {
    ...month,
    income: updatedIncome,
    readyToAssign: calculateReadyToAssign(updatedIncome, month.assigned),
    updatedAt: new Date(),
  };
}
