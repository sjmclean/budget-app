import { BudgetUser } from "../../types/src/BudgetUser.js";
import { BudgetRole } from "../../types/src/BudgetRole.js";

export interface BudgetUserRepository {
  create(budgetUser: BudgetUser): Promise<void>;
  getRole(userId: string, budgetId: string): Promise<BudgetRole | null>;
  findBudgetsForUser(userId: string): Promise<BudgetUser[]>;
  findUsersForBudget(budgetId: string): Promise<BudgetUser[]>;
  deleteForBudget(budgetId: string): Promise<void>;
}
