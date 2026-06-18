import { ClearedStatus } from "../../types/src/ClearedStatus.js";
import { Transaction } from "../../types/src/Transaction.js";

export interface TransactionRepository {
  create(transaction: Transaction): Promise<void>;
  update(transaction: Transaction): Promise<void>;
  getById(id: string): Promise<Transaction | null>;
  findByBudget(budgetId: string): Promise<Transaction[]>;
  findByAccount(accountId: string): Promise<Transaction[]>;
  findByStatus?(budgetId: string, status: ClearedStatus): Promise<Transaction[]>;
  softDelete(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}
