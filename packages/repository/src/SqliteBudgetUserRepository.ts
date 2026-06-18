import { and, eq } from "drizzle-orm";
import { budgetUsers } from "../../database/src/schema.js";
import { BudgetUser } from "../../types/src/BudgetUser.js";
import { BudgetRole } from "../../types/src/BudgetRole.js";
import { BudgetUserRepository } from "./BudgetUserRepository.js";

export class SqliteBudgetUserRepository implements BudgetUserRepository {
  constructor(private db: any) {}

  async create(budgetUser: BudgetUser): Promise<void> {
    await this.db.insert(budgetUsers).values(budgetUser);
  }

  async getRole(userId: string, budgetId: string): Promise<BudgetRole | null> {
    const rows = await this.db
      .select()
      .from(budgetUsers)
      .where(
        and(eq(budgetUsers.userId, userId), eq(budgetUsers.budgetId, budgetId)),
      );

    return rows[0]?.role ?? null;
  }

  async findBudgetsForUser(userId: string): Promise<BudgetUser[]> {
    return await this.db
      .select()
      .from(budgetUsers)
      .where(eq(budgetUsers.userId, userId));
  }

  async findUsersForBudget(budgetId: string): Promise<BudgetUser[]> {
    return await this.db
      .select()
      .from(budgetUsers)
      .where(eq(budgetUsers.budgetId, budgetId));
  }

  async deleteForBudget(budgetId: string): Promise<void> {
    await this.db.delete(budgetUsers).where(eq(budgetUsers.budgetId, budgetId));
  }
}
