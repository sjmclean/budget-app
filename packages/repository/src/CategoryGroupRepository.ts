import { CategoryGroup } from "../../types/src/CategoryGroup.js";

export interface CategoryGroupRepository {
  create(group: CategoryGroup): Promise<void>;
  update(group: CategoryGroup): Promise<void>;
  getById(id: string): Promise<CategoryGroup | null>;
  findByBudget(budgetId: string): Promise<CategoryGroup[]>;
}
