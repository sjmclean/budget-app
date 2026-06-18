import { ClearedStatus } from "../../types/src/ClearedStatus.js";
import { Transaction } from "../../types/src/Transaction.js";
import { TransactionRepository } from "../../repository/src/TransactionRepository.js";

export interface TransactionFilterInput {
  budgetId: string;
  accountId?: string;
  categoryId?: string | null;
  payeeId?: string | null;
  clearedStatus?: ClearedStatus;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  includeDeleted?: boolean;
}

export class SearchFilterApplicationService {
  constructor(private transactionRepo: TransactionRepository) {}

  async filterTransactions(
    input: TransactionFilterInput,
  ): Promise<Transaction[]> {
    const transactions = input.accountId
      ? await this.transactionRepo.findByAccount(input.accountId)
      : await this.transactionRepo.findByBudget(input.budgetId);

    return transactions.filter((tx) => {
      if (!input.includeDeleted && tx.isDeleted) return false;
      if (tx.budgetId !== input.budgetId) return false;
      if (input.categoryId !== undefined && tx.categoryId !== input.categoryId)
        return false;
      if (input.payeeId !== undefined && tx.payeeId !== input.payeeId)
        return false;
      if (
        input.clearedStatus !== undefined &&
        tx.clearedStatus !== input.clearedStatus
      )
        return false;
      if (input.dateFrom && tx.date < input.dateFrom) return false;
      if (input.dateTo && tx.date > input.dateTo) return false;
      if (input.amountMin !== undefined && tx.amount < input.amountMin)
        return false;
      if (input.amountMax !== undefined && tx.amount > input.amountMax)
        return false;
      return true;
    });
  }
}
