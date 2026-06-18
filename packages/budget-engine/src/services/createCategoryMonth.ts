import { randomUUID } from "crypto";
import { CategoryMonth } from "../../../types/src/CategoryMonth.js";
import { calculateAvailable } from "../calculations/calculateAvailable.js";

export function createCategoryMonth(budgetMonthId: string, categoryId: string, previousAvailable = 0, assigned = 0, activity = 0): CategoryMonth {
  const now = new Date();
  return { id: randomUUID(), budgetMonthId, categoryId, previousAvailable, assigned, activity, available: calculateAvailable(previousAvailable, assigned, activity), createdAt: now, updatedAt: now };
}
