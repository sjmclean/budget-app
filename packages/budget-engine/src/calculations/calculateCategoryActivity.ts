import { Transaction } from "../../../types/src/Transaction.js";

export function calculateCategoryActivity(categoryId: string, transactions: Transaction[]): number {
  return transactions.filter((transaction) => !transaction.isDeleted).filter((transaction) => transaction.categoryId === categoryId).reduce((total, transaction) => total + transaction.amount, 0);
}
