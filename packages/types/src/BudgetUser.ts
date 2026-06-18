import { BudgetRole } from "./BudgetRole.js";

export interface BudgetUser {
  id: string;
  budgetId: string;
  userId: string;
  role: BudgetRole;
  createdAt: Date;
}
