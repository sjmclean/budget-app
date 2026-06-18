import { Transaction } from "../../../types/src/Transaction.js";
import { TransactionType } from "../../../types/src/TransactionType.js";
import { ValidationError } from "../../../types/src/AppError.js";

export function validateTransaction(transaction: Transaction): void {
  if (!transaction.budgetId)
    throw new ValidationError("Transaction must belong to a budget");
  if (!transaction.accountId)
    throw new ValidationError("Transaction must belong to an account");
  if (!transaction.date)
    throw new ValidationError("Transaction date is required");
  if (!Number.isFinite(transaction.amount))
    throw new ValidationError("Transaction amount must be a finite number");

  if (
    transaction.type === TransactionType.Standard &&
    transaction.amount < 0 &&
    !transaction.categoryId
  ) {
    throw new ValidationError("Spending transactions must have a category", {
      transactionId: transaction.id,
    });
  }
}
