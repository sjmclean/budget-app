import { eq } from "drizzle-orm";
import { categories } from "../../database/src/schema.js";
import { Category } from "../../types/src/Category.js";
import { CategoryRepository } from "./CategoryRepository.js";

export class SqliteCategoryRepository implements CategoryRepository {
  constructor(private db: any) {}
  async create(category: Category): Promise<void> {
    await this.db.insert(categories).values(category);
  }
  async update(category: Category): Promise<void> {
    await this.db
      .update(categories)
      .set(category)
      .where(eq(categories.id, category.id));
  }
  async getById(id: string): Promise<Category | null> {
    const rows = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id));
    return rows[0] ?? null;
  }
  async findByGroup(groupId: string): Promise<Category[]> {
    return await this.db
      .select()
      .from(categories)
      .where(eq(categories.groupId, groupId));
  }
}
