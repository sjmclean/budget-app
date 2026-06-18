import { eq } from "drizzle-orm";
import { categoryGroups } from "../../database/src/schema.js";
import { CategoryGroup } from "../../types/src/CategoryGroup.js";
import { CategoryGroupRepository } from "./CategoryGroupRepository.js";

export class SqliteCategoryGroupRepository implements CategoryGroupRepository {
  constructor(private db: any) {}
  async create(group: CategoryGroup): Promise<void> {
    await this.db.insert(categoryGroups).values(group);
  }
  async update(group: CategoryGroup): Promise<void> {
    await this.db
      .update(categoryGroups)
      .set(group)
      .where(eq(categoryGroups.id, group.id));
  }
  async getById(id: string): Promise<CategoryGroup | null> {
    const rows = await this.db
      .select()
      .from(categoryGroups)
      .where(eq(categoryGroups.id, id));
    return rows[0] ?? null;
  }
  async findByBudget(budgetId: string): Promise<CategoryGroup[]> {
    return await this.db
      .select()
      .from(categoryGroups)
      .where(eq(categoryGroups.budgetId, budgetId));
  }
}
