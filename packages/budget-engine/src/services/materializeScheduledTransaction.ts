import { ScheduledTransaction } from "../../../types/src/ScheduledTransaction.js";
import { Transaction } from "../../../types/src/Transaction.js";
import { createTransaction } from "./createTransaction.js";

export function materializeScheduledTransaction(
  scheduled: ScheduledTransaction,
  date = scheduled.nextDueDate,
): Transaction {
  return createTransaction({
    budgetId: scheduled.budgetId,
    accountId: scheduled.accountId,
    payeeId: scheduled.payeeId,
    categoryId: scheduled.categoryId,
    date,
    amount: scheduled.amount,
    memo: scheduled.memo,
  });
}
