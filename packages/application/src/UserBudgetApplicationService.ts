import { Budget } from "../../types/src/Budget.js";
import { BudgetRole } from "../../types/src/BudgetRole.js";
import { createBudget } from "../../budget-engine/src/services/createBudget.js";
import { createBudgetUser } from "../../budget-engine/src/services/createBudgetUser.js";
import { canDeleteBudget, canEditBudget, canViewBudget } from "../../budget-engine/src/services/permissions.js";
import { BudgetRepository } from "../../repository/src/BudgetRepository.js";
import { BudgetUserRepository } from "../../repository/src/BudgetUserRepository.js";

export class UserBudgetApplicationService {
  constructor(
    private budgetRepo: BudgetRepository,
    private budgetUserRepo: BudgetUserRepository
  ) {}

  async createBudgetForUser(userId: string, name: string, currency = "AUD"): Promise<Budget> {
    const budget = createBudget(name, currency);
    await this.budgetRepo.create(budget);
    await this.budgetUserRepo.create(createBudgetUser(budget.id, userId, BudgetRole.Owner));
    return budget;
  }

  async listAccessibleBudgetIds(userId: string): Promise<string[]> {
    const rows = await this.budgetUserRepo.findBudgetsForUser(userId);
    return rows.map((row) => row.budgetId);
  }

  async requireCanView(userId: string, budgetId: string): Promise<void> {
    const role = await this.budgetUserRepo.getRole(userId, budgetId);
    if (!canViewBudget(role)) throw new Error("Permission denied");
  }

  async requireCanEdit(userId: string, budgetId: string): Promise<void> {
    const role = await this.budgetUserRepo.getRole(userId, budgetId);
    if (!canEditBudget(role)) throw new Error("Permission denied");
  }

  async requireCanDelete(userId: string, budgetId: string): Promise<void> {
    const role = await this.budgetUserRepo.getRole(userId, budgetId);
    if (!canDeleteBudget(role)) throw new Error("Permission denied");
  }

  async shareBudget(ownerUserId: string, budgetId: string, targetUserId: string, role: BudgetRole): Promise<void> {
    await this.requireCanDelete(ownerUserId, budgetId);
    await this.budgetUserRepo.create(createBudgetUser(budgetId, targetUserId, role));
  }

  async deleteBudgetAccessRecords(userId: string, budgetId: string): Promise<void> {
    await this.requireCanDelete(userId, budgetId);
    await this.budgetUserRepo.deleteForBudget(budgetId);
  }
}
