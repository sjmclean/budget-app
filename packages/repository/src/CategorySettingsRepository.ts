import { CategorySettings } from "../../types/src/CategorySettings.js";

export interface CategorySettingsRepository {
  create(item: CategorySettings): Promise<void>;
  update?(item: CategorySettings): Promise<void>;
  findByCategoryId(categoryId: string): Promise<CategorySettings[]>;
}
