import { CategoryMonth } from "../../../types/src/CategoryMonth.js";
import { calculateAvailable } from "../calculations/calculateAvailable.js";

export function applyActivityToCategoryMonth(categoryMonth: CategoryMonth, activity: number): CategoryMonth {
  const updatedActivity = categoryMonth.activity + activity;
  return { ...categoryMonth, activity: updatedActivity, available: calculateAvailable(categoryMonth.previousAvailable, categoryMonth.assigned, updatedActivity), updatedAt: new Date() };
}
