import { randomUUID } from "crypto";
import { BudgetUser } from "../../../types/src/BudgetUser.js";
import { BudgetRole } from "../../../types/src/BudgetRole.js";

export function createBudgetUser(
  budgetId: string,
  userId: string,
  role: BudgetRole
): BudgetUser {
  return {
    id: randomUUID(),
    budgetId,
    userId,
    role,
    createdAt: new Date()
  };
}
