import { Category } from "../../../types/src/Category.js";
import { SpendingByCategoryRow } from "../../../types/src/Reports.js";
import { Transaction } from "../../../types/src/Transaction.js";

export function spendingByCategory(
  categories: Category[],
  transactions: Transaction[],
): SpendingByCategoryRow[] {
  return categories.map((category) => ({
    categoryId: category.id,
    categoryName: category.name,
    total: transactions
      .filter((transaction) => !transaction.isDeleted)
      .filter((transaction) => transaction.categoryId === category.id)
      .reduce((total, transaction) => total + transaction.amount, 0),
  }));
}
