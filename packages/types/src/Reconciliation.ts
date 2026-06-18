export interface Reconciliation {
  id: string;
  budgetId: string;
  accountId: string;
  statementDate: string;
  statementBalance: number;
  clearedBalance: number;
  difference: number;
  createdAt: Date;
}
