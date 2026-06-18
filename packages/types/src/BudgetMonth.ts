export interface BudgetMonth {
  id: string;
  budgetId: string;
  month: string;
  income: number;
  assigned: number;
  activity: number;
  readyToBudget: number;
  createdAt: Date;
  updatedAt: Date;
}
