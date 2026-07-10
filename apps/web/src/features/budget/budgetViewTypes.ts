export interface BudgetCategoryView {
  id: string;
  name: string;
  previousAvailable: number;
  assigned: number;
  activity: number;
  available: number;
  isOverspent: boolean;
  isArchived: boolean;
  note: string;
}

export interface BudgetCategoryGroupView {
  id: string;
  name: string;
  previousAvailable: number;
  assigned: number;
  activity: number;
  available: number;
  note: string;
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
  isArchived?: boolean;
}

export interface CategoryMergePreview {
  sourceCategoryId: string;
  sourceCategoryName: string;
  sourceGroupName: string;
  sourcePreviousAvailable: number;
  sourceAssigned: number;
  sourceActivity: number;
  sourceAvailable: number;
  sourceIsArchived: boolean;
  targetCategoryId: string;
  targetCategoryName: string;
  targetGroupName: string;
  targetPreviousAvailable: number;
  targetAssigned: number;
  targetActivity: number;
  targetAvailable: number;
  targetIsArchived: boolean;
  combinedPreviousAvailable: number;
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

  setCategoryAssignedValues(input: {
    budgetId: string;
    month: string;
    assignments: Array<{
      categoryId: string;
      assigned: number;
    }>;
  }): Promise<BudgetMonthView>;

  coverOverspending(input: {
    budgetId: string;
    month: string;
    overspentCategoryId: string;
    coveringCategoryId: string;
    amount: number;
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

  moveCategoryToPosition(input: {
    budgetId: string;
    month: string;
    categoryId: string;
    targetCategoryId: string;
    placement: "before" | "after";
  }): Promise<BudgetMonthView>;

  moveCategoryGroup(input: {
    budgetId: string;
    month: string;
    groupId: string;
    direction: "up" | "down";
  }): Promise<BudgetMonthView>;

  moveCategoryGroupToPosition(input: {
    budgetId: string;
    month: string;
    groupId: string;
    targetGroupId: string;
    placement: "before" | "after";
  }): Promise<BudgetMonthView>;

  updateCategoryNote(input: {
    budgetId: string;
    month: string;
    categoryId: string;
    note: string;
  }): Promise<BudgetMonthView>;

  updateCategoryGroupNote(input: {
    budgetId: string;
    month: string;
    groupId: string;
    note: string;
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
