export interface BudgetCategoryView {
  id: string;
  name: string;
  assigned: number;
  activity: number;
  available: number;
  isOverspent: boolean;
  isArchived: boolean;
}

export interface BudgetCategoryGroupView {
  id: string;
  name: string;
  assigned: number;
  activity: number;
  available: number;
  categories: BudgetCategoryView[];
}

export interface BudgetCategoryOption {
  id: string;
  name: string;
  groupName: string;
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

  updateAssigned(input: {
    budgetId: string;
    month: string;
    categoryId: string;
    assigned: number;
  }): Promise<BudgetMonthView>;

  renameCategory(input: {
    budgetId: string;
    month: string;
    categoryId: string;
    name: string;
  }): Promise<BudgetMonthView>;

  setCategoryArchived(input: {
    budgetId: string;
    month: string;
    categoryId: string;
    isArchived: boolean;
  }): Promise<BudgetMonthView>;

  moveCategory(input: {
    budgetId: string;
    month: string;
    categoryId: string;
    direction: "up" | "down";
  }): Promise<BudgetMonthView>;

  getCategoryOptions(input: {
    budgetId: string;
    month: string;
  }): Promise<BudgetCategoryOption[]>;
}
