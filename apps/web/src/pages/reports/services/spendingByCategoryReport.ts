import type { RegisterTransactionView } from "../../../features/accounts/accountRegisterTypes";

export interface SpendingCategoryRow {
  categoryId: string;
  categoryName: string;
  groupName: string;
  total: number;
  transactionCount?: number;
  transactions: RegisterTransactionView[];
}

export function calculateSpendingTotal(rows: SpendingCategoryRow[]): number {
  return rows.reduce((total, row) => total + row.total, 0);
}
