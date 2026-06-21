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


export interface BudgetActivityDrilldownRow {
  id: string;
  transactionId: string;
  splitLineId?: string;
  accountId: string;
  accountName: string;
  date: string;
  payee: string;
  memo: string;
  categoryId: string;
  categoryName: string;
  inflow: number;
  outflow: number;
  amount: number;
  isSplit: boolean;
}

export interface BudgetActivityDrilldown {
  budgetId: string;
  month: string;
  monthLabel: string;
  categoryId: string;
  categoryName: string;
  currencyCode: string;
  rows: BudgetActivityDrilldownRow[];
  totalInflow: number;
  totalOutflow: number;
  netActivity: number;
}

export interface BudgetCategoryOption {
  id: string;
  name: string;
  groupName: string;
}

export interface CategoryMergePreview {
  sourceCategoryId: string;
  sourceCategoryName: string;
  sourceGroupName: string;
  sourceAssigned: number;
  sourceActivity: number;
  sourceAvailable: number;
  sourceIsArchived: boolean;
  targetCategoryId: string;
  targetCategoryName: string;
  targetGroupName: string;
  targetAssigned: number;
  targetActivity: number;
  targetAvailable: number;
  targetIsArchived: boolean;
  combinedAssigned: number;
  combinedActivity: number;
  combinedAvailable: number;
  registerTransactionCount: number;
  registerSplitLineCount: number;
  scheduledTransactionCount: number;
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

  moveCategoryGroup(input: {
    budgetId: string;
    month: string;
    groupId: string;
    direction: "up" | "down";
  }): Promise<BudgetMonthView>;

  getCategoryMergePreview(input: {
    budgetId: string;
    month: string;
    sourceCategoryId: string;
    targetCategoryId: string;
  }): Promise<CategoryMergePreview>;

  mergeCategory(input: {
    budgetId: string;
    month: string;
    sourceCategoryId: string;
    targetCategoryId: string;
  }): Promise<BudgetMonthView>;

  getCategoryOptions(input: {
    budgetId: string;
    month: string;
  }): Promise<BudgetCategoryOption[]>;

  getCategoryActivityDrilldown(input: {
    budgetId: string;
    month: string;
    categoryId: string;
  }): Promise<BudgetActivityDrilldown>;
}
