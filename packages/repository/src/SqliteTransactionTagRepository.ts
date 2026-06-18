import { eq } from "drizzle-orm";
import { transactionTags } from "../../database/src/schema.js";
import { TransactionTag } from "../../types/src/TransactionTag.js";
import { TransactionTagRepository } from "./TransactionTagRepository.js";

export class SqliteTransactionTagRepository implements TransactionTagRepository {
  constructor(private db: any) {}

  async create(item: TransactionTag): Promise<void> {
    await this.db.insert(transactionTags).values(item);
  }
  async update(item: TransactionTag): Promise<void> {
    await this.db
      .update(transactionTags)
      .set(item)
      .where(eq(transactionTags.id, item.id));
  }
  async deleteById(id: string): Promise<void> {
    await this.db.delete(transactionTags).where(eq(transactionTags.id, id));
  }
  async findByBudgetId(budgetId: string): Promise<TransactionTag[]> {
    return await this.db
      .select()
      .from(transactionTags)
      .where(eq(transactionTags.budgetId, budgetId));
  }
  async findById(id: string): Promise<TransactionTag | null> {
    const rows = await this.db
      .select()
      .from(transactionTags)
      .where(eq(transactionTags.id, id));
    return rows[0] ?? null;
  }
}
