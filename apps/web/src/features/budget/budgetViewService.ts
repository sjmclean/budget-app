import type {
  BudgetCategoryGroupView,
  BudgetCategoryView,
  BudgetMonthView,
  BudgetViewService,
} from "./budgetViewTypes";

const STORAGE_KEY_PREFIX = "budget-app.budget-view.v1";

const starterCategoryGroups: Array<{
  id: string;
  name: string;
  categories: Array<{ id: string; name: string }>;
}> = [
  {
    id: "immediate-obligations",
    name: "Immediate Obligations",
    categories: [
      { id: "mortgage", name: "Mortgage" },
      { id: "groceries", name: "Groceries" },
      { id: "electricity", name: "Electricity" },
      { id: "internet", name: "Internet" },
    ],
  },
  {
    id: "true-expenses",
    name: "True Expenses",
    categories: [
      { id: "car-rego", name: "Car Rego" },
      { id: "insurance", name: "Insurance" },
      { id: "medical", name: "Medical" },
    ],
  },
  {
    id: "quality-of-life",
    name: "Quality of Life",
    categories: [
      { id: "dining-out", name: "Dining Out" },
      { id: "entertainment", name: "Entertainment" },
      { id: "streaming", name: "Streaming" },
    ],
  },
  {
    id: "giving-and-savings",
    name: "Giving & Savings",
    categories: [
      { id: "emergency-fund", name: "Emergency Fund" },
      { id: "holiday", name: "Holiday" },
    ],
  },
];

function getStorageKey(budgetId: string, month: string): string {
  return `${STORAGE_KEY_PREFIX}.${budgetId}.${month}`;
}

function cloneBudgetView(view: BudgetMonthView): BudgetMonthView {
  return {
    ...view,
    categoryGroups: view.categoryGroups.map((group) => ({
      ...group,
      categories: group.categories.map((category) => ({ ...category })),
    })),
  };
}

function monthLabelFromIsoMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);

  if (!year || !monthNumber) {
    return month;
  }

  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthNumber - 1, 1));
}

function recalculateCategory(category: BudgetCategoryView): BudgetCategoryView {
  const available = category.assigned + category.activity;

  return {
    ...category,
    available,
    isOverspent: available < 0,
  };
}

function recalculateGroup(group: BudgetCategoryGroupView): BudgetCategoryGroupView {
  const categories = group.categories.map(recalculateCategory);
  const assigned = categories.reduce((sum, category) => sum + category.assigned, 0);
  const activity = categories.reduce((sum, category) => sum + category.activity, 0);
  const available = categories.reduce((sum, category) => sum + category.available, 0);

  return {
    ...group,
    categories,
    assigned,
    activity,
    available,
  };
}

function recalculateBudget(view: BudgetMonthView): BudgetMonthView {
  const categoryGroups = view.categoryGroups.map(recalculateGroup);
  const totalAssigned = categoryGroups.reduce((sum, group) => sum + group.assigned, 0);
  const totalActivity = categoryGroups.reduce((sum, group) => sum + group.activity, 0);
  const totalAvailable = categoryGroups.reduce((sum, group) => sum + group.available, 0);

  return {
    ...view,
    readyToAssign: 0 - totalAssigned,
    totalAssigned,
    totalActivity,
    totalAvailable,
    categoryGroups,
  };
}

function createStarterBudgetView(budgetId: string, month: string): BudgetMonthView {
  return recalculateBudget({
    budgetId,
    budgetName: "Household Budget",
    monthLabel: monthLabelFromIsoMonth(month),
    currencyCode: "AUD",
    readyToAssign: 0,
    totalAssigned: 0,
    totalActivity: 0,
    totalAvailable: 0,
    categoryGroups: starterCategoryGroups.map((group) => ({
      id: group.id,
      name: group.name,
      assigned: 0,
      activity: 0,
      available: 0,
      categories: group.categories.map((category) => ({
        id: category.id,
        name: category.name,
        assigned: 0,
        activity: 0,
        available: 0,
        isOverspent: false,
      })),
    })),
  });
}

function readStoredBudgetView(budgetId: string, month: string): BudgetMonthView | null {
  const raw = window.localStorage.getItem(getStorageKey(budgetId, month));

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as BudgetMonthView;
    return recalculateBudget(parsed);
  } catch {
    return null;
  }
}

function saveBudgetView(view: BudgetMonthView, month: string): BudgetMonthView {
  const next = recalculateBudget(view);
  window.localStorage.setItem(getStorageKey(next.budgetId, month), JSON.stringify(next));
  return cloneBudgetView(next);
}

function loadBudgetView(budgetId: string, month: string): BudgetMonthView {
  const stored = readStoredBudgetView(budgetId, month);

  if (stored) {
    return cloneBudgetView(stored);
  }

  const starter = createStarterBudgetView(budgetId, month);
  return saveBudgetView(starter, month);
}

export const budgetViewService: BudgetViewService = {
  async getBudgetMonthView({ budgetId, month }) {
    return loadBudgetView(budgetId, month);
  },

  async updateAssigned({ budgetId, month, categoryId, assigned }) {
    const current = loadBudgetView(budgetId, month);
    const nextGroups = current.categoryGroups.map((group) => ({
      ...group,
      categories: group.categories.map((category) => {
        if (category.id !== categoryId) {
          return category;
        }

        return {
          ...category,
          assigned,
        };
      }),
    }));

    return saveBudgetView(
      {
        ...current,
        categoryGroups: nextGroups,
      },
      month,
    );
  },
};
