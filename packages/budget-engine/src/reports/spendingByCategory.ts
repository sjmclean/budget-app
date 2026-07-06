import { Category } from "../../../types/src/Category.js";
import { SpendingByCategoryRow } from "../../../types/src/Reports.js";
import { Transaction } from "../../../types/src/Transaction.js";

export function spendingByCategory(categories: Category[], transactions: Transaction[]): SpendingByCategoryRow[] {
  return categories
    .map((category) => ({
      categoryId: category.id,
      categoryName: category.name,
      total: transactions
        .filter((transaction) => !transaction.isDeleted)
        .filter((transaction) => transaction.categoryId === category.id)
        .filter((transaction) => transaction.amount < 0)
        .reduce((total, transaction) => total + Math.abs(transaction.amount), 0),
    }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total || a.categoryName.localeCompare(b.categoryName));
}
