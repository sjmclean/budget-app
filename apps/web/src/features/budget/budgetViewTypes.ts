export interface BudgetCategoryView {
  id: string;
  name: string;
  assigned: number;
  activity: number;
  available: number;
  isOverspent: boolean;
}

export interface BudgetCategoryGroupView {
  id: string;
  name: string;
  assigned: number;
  activity: number;
  available: number;
  categories: BudgetCategoryView[];
}

export interface BudgetMonthView {
  budgetId: string;
  budgetName: string;
  monthLabel: string;
  currencyCode: string;
  readyToAssign: number;
  totalAssigned: number;
  totalActivity: number;
  totalAvailable: number;
  categoryGroups: BudgetCategoryGroupView[];
}

export interface BudgetViewService {
  getBudgetMonthView(input: {
    budgetId: string;
    month: string;
  }): Promise<BudgetMonthView>;
}
