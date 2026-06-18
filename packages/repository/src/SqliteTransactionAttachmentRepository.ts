import { eq } from "drizzle-orm";
import { transactionAttachments } from "../../database/src/schema.js";
import { TransactionAttachment } from "../../types/src/TransactionAttachment.js";
import { TransactionAttachmentRepository } from "./TransactionAttachmentRepository.js";

export class SqliteTransactionAttachmentRepository implements TransactionAttachmentRepository {
  constructor(private db: any) {}

  async create(attachment: TransactionAttachment): Promise<void> {
    await this.db.insert(transactionAttachments).values(attachment);
  }

  async findByTransaction(
    transactionId: string,
  ): Promise<TransactionAttachment[]> {
    return await this.db
      .select()
      .from(transactionAttachments)
      .where(eq(transactionAttachments.transactionId, transactionId));
  }

  async findByBudget(budgetId: string): Promise<TransactionAttachment[]> {
    return await this.db
      .select()
      .from(transactionAttachments)
      .where(eq(transactionAttachments.budgetId, budgetId));
  }

  async delete(id: string): Promise<void> {
    await this.db
      .delete(transactionAttachments)
      .where(eq(transactionAttachments.id, id));
  }
}
