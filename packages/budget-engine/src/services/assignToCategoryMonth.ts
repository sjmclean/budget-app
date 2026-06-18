import { BudgetMonth } from "../../../types/src/BudgetMonth.js";
import { CategoryMonth } from "../../../types/src/CategoryMonth.js";
import { calculateAvailable } from "../calculations/calculateAvailable.js";
import { calculateReadyToBudget } from "../calculations/calculateReadyToBudget.js";

export interface AssignmentResult {
  budgetMonth: BudgetMonth;
  categoryMonth: CategoryMonth;
}

export function assignToCategoryMonth(
  budgetMonth: BudgetMonth,
  categoryMonth: CategoryMonth,
  amount: number,
): AssignmentResult {
  if (amount > budgetMonth.readyToBudget)
    throw new Error("Insufficient Ready To Budget");
  const assigned = categoryMonth.assigned + amount;
  const monthAssigned = budgetMonth.assigned + amount;
  return {
    budgetMonth: {
      ...budgetMonth,
      assigned: monthAssigned,
      readyToBudget: calculateReadyToBudget(budgetMonth.income, monthAssigned),
      updatedAt: new Date(),
    },
    categoryMonth: {
      ...categoryMonth,
      assigned,
      available: calculateAvailable(
        categoryMonth.previousAvailable,
        assigned,
        categoryMonth.activity,
      ),
      updatedAt: new Date(),
    },
  };
}
