import { ScheduledTransaction } from "../../types/src/ScheduledTransaction.js";

export interface ScheduledTransactionRepository {
  create(scheduled: ScheduledTransaction): Promise<void>;
  findActiveByBudget(budgetId: string): Promise<ScheduledTransaction[]>;
  update?(scheduled: ScheduledTransaction): Promise<void>;
}
