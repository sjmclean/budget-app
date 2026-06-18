import { eq, inArray } from "drizzle-orm";
import { transactionFlags, transactions } from "../../database/src/schema.js";
import { TransactionFlag } from "../../types/src/TransactionFlag.js";
import { TransactionFlagRepository } from "./TransactionFlagRepository.js";

export class SqliteTransactionFlagRepository implements TransactionFlagRepository {
  constructor(private db: any) {}

  async create(item: TransactionFlag): Promise<void> {
    await this.db.insert(transactionFlags).values(item);
  }

  async update(item: TransactionFlag): Promise<void> {
    await this.db
      .update(transactionFlags)
      .set(item)
      .where(eq(transactionFlags.id, item.id));
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(transactionFlags).where(eq(transactionFlags.id, id));
  }

  async deleteByTransactionId(transactionId: string): Promise<void> {
    await this.db
      .delete(transactionFlags)
      .where(eq(transactionFlags.transactionId, transactionId));
  }

  async findByTransactionId(transactionId: string): Promise<TransactionFlag[]> {
    return await this.db
      .select()
      .from(transactionFlags)
      .where(eq(transactionFlags.transactionId, transactionId));
  }

  async findByBudgetId(budgetId: string): Promise<TransactionFlag[]> {
    const txs = await this.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.budgetId, budgetId));
    const ids = txs.map((t: { id: string }) => t.id);
    if (ids.length === 0) return [];
    return await this.db
      .select()
      .from(transactionFlags)
      .where(inArray(transactionFlags.transactionId, ids));
  }

  async findByColour(
    budgetId: string,
    colour: string,
  ): Promise<TransactionFlag[]> {
    const all = await this.findByBudgetId(budgetId);
    return all.filter((flag) => flag.colour === colour);
  }
}
