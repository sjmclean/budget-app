import type { RegisterTransactionView } from "../../../features/accounts/accountRegisterTypes";

export interface SpendingCategoryRow {
  categoryId: string;
  categoryName: string;
  groupName: string;
  total: number;
  transactions: RegisterTransactionView[];
}

export interface SpendingCategoryOption {
  id: string;
  name: string;
  groupName: string;
}

export function isTransactionInMonth(transaction: RegisterTransactionView, month: string): boolean {
  return transaction.date.startsWith(`${month}-`);
}

export function buildSpendingByCategoryRows(
  categoryOptions: SpendingCategoryOption[],
  transactions: RegisterTransactionView[],
  month: string,
): SpendingCategoryRow[] {
  const categoryById = new Map(categoryOptions.map((category) => [category.id, category]));
  const rows = new Map<string, SpendingCategoryRow>();

  for (const transaction of transactions) {
    if (!isTransactionInMonth(transaction, month)) continue;
    if (!transaction.categoryId) continue;
    if (transaction.outflow <= 0) continue;

    const category = categoryById.get(transaction.categoryId);
    if (!category || category.id === "__ready_to_assign__") continue;

    const existing = rows.get(category.id) ?? {
      categoryId: category.id,
      categoryName: category.name,
      groupName: category.groupName,
      total: 0,
      transactions: [],
    };

    existing.total += transaction.outflow;
    existing.transactions.push(transaction);
    rows.set(category.id, existing);
  }

  return [...rows.values()].sort((a, b) => b.total - a.total || a.categoryName.localeCompare(b.categoryName));
}

export function calculateSpendingTotal(rows: SpendingCategoryRow[]): number {
  return rows.reduce((total, row) => total + row.total, 0);
}
