import { ScheduledTransaction } from "../../types/src/ScheduledTransaction.js";
import { Transaction } from "../../types/src/Transaction.js";
import { materializeScheduledTransaction } from "../../budget-engine/src/services/materializeScheduledTransaction.js";
import { advanceScheduledTransactionDate } from "../../budget-engine/src/services/advanceScheduledTransactionDate.js";
import { ScheduledTransactionRepository } from "../../repository/src/ScheduledTransactionRepository.js";
import { TransactionRepository } from "../../repository/src/TransactionRepository.js";

export interface ScheduledExecutionResult {
  scheduledTransaction: ScheduledTransaction;
  transaction: Transaction;
}

export class ScheduledTransactionExecutionService {
  constructor(
    private scheduledRepo: ScheduledTransactionRepository,
    private transactionRepo: TransactionRepository
  ) {}

  async findDue(budgetId: string, asOfDate: string): Promise<ScheduledTransaction[]> {
    const active = await this.scheduledRepo.findActiveByBudget(budgetId);
    return active.filter((item) => item.nextDueDate <= asOfDate);
  }

  async executeDue(budgetId: string, asOfDate: string): Promise<ScheduledExecutionResult[]> {
    const due = await this.findDue(budgetId, asOfDate);
    const results: ScheduledExecutionResult[] = [];

    for (const item of due) {
      const transaction = materializeScheduledTransaction(item, item.nextDueDate);
      await this.transactionRepo.create(transaction);

      const nextDueDate = advanceScheduledTransactionDate(item.nextDueDate, item.frequency);
      const updated: ScheduledTransaction = {
        ...item,
        nextDueDate: nextDueDate ?? item.nextDueDate,
        isActive: nextDueDate !== null,
        updatedAt: new Date()
      };

      if (this.scheduledRepo.update) {
        await this.scheduledRepo.update(updated);
      }

      results.push({ scheduledTransaction: updated, transaction });
    }

    return results;
  }
}
