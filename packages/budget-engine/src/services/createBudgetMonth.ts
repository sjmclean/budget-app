import { randomUUID } from "crypto";
import { BudgetMonth } from "../../../types/src/BudgetMonth.js";
import { calculateReadyToBudget } from "../calculations/calculateReadyToBudget.js";

export function createBudgetMonth(budgetId: string, month: string, income = 0, assigned = 0, activity = 0): BudgetMonth {
  const now = new Date();
  return { id: randomUUID(), budgetId, month, income, assigned, activity, readyToBudget: calculateReadyToBudget(income, assigned), createdAt: now, updatedAt: now };
}
