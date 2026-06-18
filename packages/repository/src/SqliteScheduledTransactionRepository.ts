import { and, eq } from "drizzle-orm";
import { scheduledTransactions } from "../../database/src/schema.js";
import { ScheduledTransaction } from "../../types/src/ScheduledTransaction.js";
import { ScheduledTransactionRepository } from "./ScheduledTransactionRepository.js";

export class SqliteScheduledTransactionRepository implements ScheduledTransactionRepository {
  constructor(private db: any) {}
  async create(scheduled: ScheduledTransaction): Promise<void> { await this.db.insert(scheduledTransactions).values(scheduled); }
  async findActiveByBudget(budgetId: string): Promise<ScheduledTransaction[]> {
    return await this.db.select().from(scheduledTransactions).where(and(eq(scheduledTransactions.budgetId, budgetId), eq(scheduledTransactions.isActive, true)));
  }

  async update(scheduled: ScheduledTransaction): Promise<void> {
    await this.db.update(scheduledTransactions).set(scheduled).where(eq(scheduledTransactions.id, scheduled.id));
  }
}
