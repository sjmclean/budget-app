import { Account } from "../../../types/src/Account.js";
import { Transaction } from "../../../types/src/Transaction.js";
import { ClearedStatus } from "../../../types/src/ClearedStatus.js";

export function calculateClearedBalance(account: Account, transactions: Transaction[]): number {
  return transactions
    .filter((transaction) => !transaction.isDeleted)
    .filter((transaction) => transaction.clearedStatus === ClearedStatus.Cleared || transaction.clearedStatus === ClearedStatus.Reconciled)
    .reduce((balance, transaction) => balance + transaction.amount, account.openingBalance);
}
