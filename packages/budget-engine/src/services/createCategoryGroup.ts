import { randomUUID } from "crypto";
import { CategoryGroup } from "../../../types/src/CategoryGroup.js";

export function createCategoryGroup(budgetId: string, name: string, sortOrder = 0): CategoryGroup {
  return { id: randomUUID(), budgetId, name, sortOrder };
}
