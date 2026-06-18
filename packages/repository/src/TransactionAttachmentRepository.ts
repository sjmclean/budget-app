import { TransactionAttachment } from "../../types/src/TransactionAttachment.js";

export interface TransactionAttachmentRepository {
  create(attachment: TransactionAttachment): Promise<void>;
  findByTransaction(transactionId: string): Promise<TransactionAttachment[]>;
  findByBudget(budgetId: string): Promise<TransactionAttachment[]>;
  delete(id: string): Promise<void>;
}
