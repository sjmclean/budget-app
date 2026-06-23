import { CategoryGroupSettings } from "../../types/src/CategoryGroupSettings.js";

export interface CategoryGroupSettingsRepository {
  create(item: CategoryGroupSettings): Promise<void>;
  update?(item: CategoryGroupSettings): Promise<void>;
  findByCategoryGroupId(categoryGroupId: string): Promise<CategoryGroupSettings[]>;
}
