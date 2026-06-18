import { eq } from "drizzle-orm";
import { deletedItems } from "../../database/src/schema.js";
import { DeletedItem } from "../../types/src/DeletedItem.js";
import { DeletedItemRepository } from "./DeletedItemRepository.js";

export class SqliteDeletedItemRepository implements DeletedItemRepository {
  constructor(private db: any) {}

  async create(item: DeletedItem): Promise<void> {
    await this.db.insert(deletedItems).values(item);
  }

  async update(item: DeletedItem): Promise<void> {
    await this.db
      .update(deletedItems)
      .set(item)
      .where(eq(deletedItems.id, item.id));
  }

  async findByBudgetId(budgetId: string): Promise<DeletedItem[]> {
    return await this.db
      .select()
      .from(deletedItems)
      .where(eq(deletedItems.budgetId, budgetId));
  }
}
