export interface SpendingByCategoryRow {
  categoryId: string;
  categoryName: string;
  total: number;
}

export interface AccountBalanceRow {
  accountId: string;
  accountName: string;
  balance: number;
}

export interface NetWorthReport {
  totalOnBudget: number;
  totalOffBudget: number;
  netWorth: number;
}
