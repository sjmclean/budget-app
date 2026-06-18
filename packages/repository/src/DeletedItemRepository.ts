import { DeletedItem } from "../../types/src/DeletedItem.js";

export interface DeletedItemRepository {
  create(item: DeletedItem): Promise<void>;
  update?(item: DeletedItem): Promise<void>;
  findByBudgetId(budgetId: string): Promise<DeletedItem[]>;
}
