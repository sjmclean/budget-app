import { TransactionTag } from "../../types/src/TransactionTag.js";

export interface TransactionTagRepository {
  create(item: TransactionTag): Promise<void>;
  update(item: TransactionTag): Promise<void>;
  deleteById(id: string): Promise<void>;
  findByBudgetId(budgetId: string): Promise<TransactionTag[]>;
  findById(id: string): Promise<TransactionTag | null>;
}
