import { eq } from "drizzle-orm";
import { categorySettings } from "../../database/src/schema.js";
import { CategorySettings } from "../../types/src/CategorySettings.js";
import { CategorySettingsRepository } from "./CategorySettingsRepository.js";

export class SqliteCategorySettingsRepository implements CategorySettingsRepository {
  constructor(private db: any) {}

  async create(item: CategorySettings): Promise<void> {
    await this.db.insert(categorySettings).values(item);
  }

  async update(item: CategorySettings): Promise<void> {
    await this.db
      .update(categorySettings)
      .set(item)
      .where(eq(categorySettings.id, item.id));
  }

  async findByCategoryId(categoryId: string): Promise<CategorySettings[]> {
    return await this.db
      .select()
      .from(categorySettings)
      .where(eq(categorySettings.categoryId, categoryId));
  }
}
