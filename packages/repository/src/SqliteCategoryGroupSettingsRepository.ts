import { eq } from "drizzle-orm";
import { categoryGroupSettings } from "../../database/src/schema.js";
import { CategoryGroupSettings } from "../../types/src/CategoryGroupSettings.js";
import { CategoryGroupSettingsRepository } from "./CategoryGroupSettingsRepository.js";

export class SqliteCategoryGroupSettingsRepository implements CategoryGroupSettingsRepository {
  constructor(private db: any) {}

  async create(item: CategoryGroupSettings): Promise<void> {
    await this.db.insert(categoryGroupSettings).values(item);
  }

  async update(item: CategoryGroupSettings): Promise<void> {
    await this.db.update(categoryGroupSettings).set(item).where(eq(categoryGroupSettings.id, item.id));
  }

  async findByCategoryGroupId(categoryGroupId: string): Promise<CategoryGroupSettings[]> {
    return await this.db.select().from(categoryGroupSettings).where(eq(categoryGroupSettings.categoryGroupId, categoryGroupId));
  }
}
