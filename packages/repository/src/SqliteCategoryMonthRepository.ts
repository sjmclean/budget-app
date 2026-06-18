import { and, eq } from "drizzle-orm";
import { categoryMonths } from "../../database/src/schema.js";
import { CategoryMonth } from "../../types/src/CategoryMonth.js";
import { CategoryMonthRepository } from "./CategoryMonthRepository.js";

export class SqliteCategoryMonthRepository implements CategoryMonthRepository {
  constructor(private db: any) {}
  async create(categoryMonth: CategoryMonth): Promise<void> {
    await this.db.insert(categoryMonths).values(categoryMonth);
  }
  async update(categoryMonth: CategoryMonth): Promise<void> {
    await this.db
      .update(categoryMonths)
      .set(categoryMonth)
      .where(eq(categoryMonths.id, categoryMonth.id));
  }
  async getById(id: string): Promise<CategoryMonth | null> {
    const rows = await this.db
      .select()
      .from(categoryMonths)
      .where(eq(categoryMonths.id, id));
    return rows[0] ?? null;
  }
  async findByBudgetMonth(budgetMonthId: string): Promise<CategoryMonth[]> {
    return await this.db
      .select()
      .from(categoryMonths)
      .where(eq(categoryMonths.budgetMonthId, budgetMonthId));
  }
  async getByBudgetMonthAndCategory(
    budgetMonthId: string,
    categoryId: string,
  ): Promise<CategoryMonth | null> {
    const rows = await this.db
      .select()
      .from(categoryMonths)
      .where(
        and(
          eq(categoryMonths.budgetMonthId, budgetMonthId),
          eq(categoryMonths.categoryId, categoryId),
        ),
      );
    return rows[0] ?? null;
  }

  async findByCategory(categoryId: string): Promise<CategoryMonth[]> {
    return await this.db
      .select()
      .from(categoryMonths)
      .where(eq(categoryMonths.categoryId, categoryId));
  }
}
