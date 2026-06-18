import { and, eq } from "drizzle-orm";
import { budgetMonths } from "../../database/src/schema.js";
import { BudgetMonth } from "../../types/src/BudgetMonth.js";
import { BudgetMonthRepository } from "./BudgetMonthRepository.js";

export class SqliteBudgetMonthRepository implements BudgetMonthRepository {
  constructor(private db: any) {}
  async create(month: BudgetMonth): Promise<void> {
    await this.db.insert(budgetMonths).values(month);
  }
  async update(month: BudgetMonth): Promise<void> {
    await this.db
      .update(budgetMonths)
      .set(month)
      .where(eq(budgetMonths.id, month.id));
  }
  async findByBudget(budgetId: string): Promise<BudgetMonth[]> {
    return await this.db
      .select()
      .from(budgetMonths)
      .where(eq(budgetMonths.budgetId, budgetId));
  }
  async getByBudgetAndMonth(
    budgetId: string,
    month: string,
  ): Promise<BudgetMonth | null> {
    const rows = await this.db
      .select()
      .from(budgetMonths)
      .where(
        and(eq(budgetMonths.budgetId, budgetId), eq(budgetMonths.month, month)),
      );
    return rows[0] ?? null;
  }
}
