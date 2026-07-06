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

export type BudgetVsActualStatus = "on-track" | "fully-spent" | "overspent";

export interface BudgetVsActualRow {
  categoryId: string;
  categoryName: string;
  groupName: string;
  assigned: number;
  activity: number;
  available: number;
  status: BudgetVsActualStatus;
}
