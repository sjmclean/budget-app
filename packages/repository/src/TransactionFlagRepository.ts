import { TransactionFlag } from "../../types/src/TransactionFlag.js";

export interface TransactionFlagRepository {
  create(item: TransactionFlag): Promise<void>;
  update(item: TransactionFlag): Promise<void>;
  deleteById(id: string): Promise<void>;
  deleteByTransactionId(transactionId: string): Promise<void>;
  findByTransactionId(transactionId: string): Promise<TransactionFlag[]>;
  findByBudgetId?(budgetId: string): Promise<TransactionFlag[]>;
  findByColour?(budgetId: string, colour: string): Promise<TransactionFlag[]>;
}
