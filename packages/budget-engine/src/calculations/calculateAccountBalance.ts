import { Account } from "../../../types/src/Account.js";
import { Transaction } from "../../../types/src/Transaction.js";

export function calculateAccountBalance(account: Account, transactions: Transaction[]): number {
  return transactions.filter((transaction) => !transaction.isDeleted).reduce((balance, transaction) => balance + transaction.amount, account.openingBalance);
}
