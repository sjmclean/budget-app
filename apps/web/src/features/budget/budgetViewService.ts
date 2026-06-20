import type {
  BudgetCategoryGroupView,
  BudgetCategoryOption,
  BudgetCategoryView,
  BudgetMonthView,
  BudgetViewService,
} from "./budgetViewTypes";
import { readAccounts } from "../accounts/accountService";

const STORAGE_KEY_PREFIX = "budget-app.budget-view.v1";
const REGISTER_STORAGE_KEY = "budget-app.account-registers.v1";

interface StoredRegisterSplitLine {
  id: string;
  category: string;
  memo?: string;
  inflow: number;
  outflow: number;
}

interface StoredRegisterTransaction {
  id: string;
  date: string;
  category: string;
  inflow: number;
  outflow: number;
  transferAccountId?: string;
  splitLines?: StoredRegisterSplitLine[];
}

const READY_TO_ASSIGN_CATEGORY_ID = "__ready_to_assign__";
const READY_TO_ASSIGN_CATEGORY_NAME = "Ready to Assign";

interface StoredRegisterView {
  accountType?: string;
  transactions?: StoredRegisterTransaction[];
}

interface BudgetScopedRegisterTransaction extends StoredRegisterTransaction {
  accountId: string;
}

type StoredRegisters = Record<string, StoredRegisterView>;

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


function applyRegisterActivity(view: BudgetMonthView, month: string): BudgetMonthView {
  const categoryLookup = createCategoryLookup(view);
  const accountTypeById = new Map(readAccounts().map((account) => [account.id, account.type]));
  const activityByCategoryId = new Map<string, number>();
  let readyToAssignIncome = 0;

  for (const transaction of readBudgetScopedRegisterTransactions()) {
    if (!transaction.date.startsWith(month)) {
      continue;
    }

    if (transaction.splitLines && transaction.splitLines.length > 0) {
      for (const splitLine of transaction.splitLines) {
        const splitCategoryKey = normaliseCategoryKey(splitLine.category);
        const splitCategoryId = categoryLookup.get(splitCategoryKey);
        const splitAmount = splitLine.inflow - splitLine.outflow;

        if (isReadyToAssignCategory(splitCategoryKey)) {
          readyToAssignIncome += splitAmount;
          continue;
        }

        if (!splitCategoryId) {
          continue;
        }

        activityByCategoryId.set(
          splitCategoryId,
          (activityByCategoryId.get(splitCategoryId) ?? 0) + splitAmount,
        );
      }

      continue;
    }

    const categoryKey = normaliseCategoryKey(transaction.category);
    const categoryId = categoryLookup.get(categoryKey);
    const amount = transaction.inflow - transaction.outflow;

    if (isTransferCategory(categoryKey)) {
      if (transaction.transferAccountId) {
        const transferAccountType = accountTypeById.get(transaction.transferAccountId);

        if (transferAccountType === "tracking") {
          readyToAssignIncome += amount;
        }
      }

      continue;
    }

    if (isReadyToAssignCategory(categoryKey)) {
      readyToAssignIncome += amount;
      continue;
    }

    if (!categoryId) {
      if (transaction.inflow > 0 && transaction.outflow === 0) {
        readyToAssignIncome += amount;
      }

      continue;
    }

    activityByCategoryId.set(
      categoryId,
      (activityByCategoryId.get(categoryId) ?? 0) + amount,
    );
  }

  const recalculated = recalculateBudget({
    ...view,
    categoryGroups: view.categoryGroups.map((group) => ({
      ...group,
      categories: group.categories.map((category) => ({
        ...category,
        activity: activityByCategoryId.get(category.id) ?? 0,
      })),
    })),
  });

  return {
    ...recalculated,
    readyToAssign: readyToAssignIncome - recalculated.totalAssigned,
  };
}

function createCategoryLookup(view: BudgetMonthView): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const group of view.categoryGroups) {
    for (const category of group.categories) {
      lookup.set(normaliseCategoryKey(category.id), category.id);
      lookup.set(normaliseCategoryKey(category.name), category.id);
    }
  }

  return lookup;
}

function normaliseCategoryKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function isTransferCategory(categoryKey: string): boolean {
  return ["transfer", "accounttransfer"].includes(categoryKey);
}

function isReadyToAssignCategory(categoryKey: string): boolean {
  return [
    normaliseCategoryKey(READY_TO_ASSIGN_CATEGORY_ID),
    normaliseCategoryKey(READY_TO_ASSIGN_CATEGORY_NAME),
    "incomeforthismonth",
    "income",
  ].includes(categoryKey);
}

function readBudgetScopedRegisterTransactions(): BudgetScopedRegisterTransaction[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(REGISTER_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const registers = JSON.parse(raw) as StoredRegisters;
    const accountTypeById = new Map(readAccounts().map((account) => [account.id, account.type]));

    return Object.entries(registers).flatMap(([accountId, register]) => {
      const accountType = accountTypeById.get(accountId) ?? mapRegisterAccountType(register.accountType);

      if (accountType === "tracking") {
        return [];
      }

      return (register.transactions ?? []).map((transaction) => ({
        ...transaction,
        accountId,
      }));
    });
  } catch {
    return [];
  }
}

function mapRegisterAccountType(accountType: string | undefined): "on-budget" | "credit-card" | "tracking" | null {
  if (!accountType) {
    return null;
  }

  const normalised = accountType.toLowerCase().replace(/[^a-z0-9]+/g, "");

  if (normalised === "tracking") {
    return "tracking";
  }

  if (normalised === "creditcard") {
    return "credit-card";
  }

  if (normalised === "onbudget") {
    return "on-budget";
  }

  return null;
}

function getCategoryOptions(view: BudgetMonthView): BudgetCategoryOption[] {
  return [
    {
      id: READY_TO_ASSIGN_CATEGORY_ID,
      name: READY_TO_ASSIGN_CATEGORY_NAME,
      groupName: "Income",
    },
    ...view.categoryGroups.flatMap((group) =>
      group.categories.map((category) => ({
        id: category.id,
        name: category.name,
        groupName: group.name,
      })),
    ),
  ];
}

function saveBudgetView(view: BudgetMonthView, month: string): BudgetMonthView {
  const next = applyRegisterActivity(recalculateBudget(view), month);
  window.localStorage.setItem(getStorageKey(next.budgetId, month), JSON.stringify(next));
  return cloneBudgetView(next);
}

function loadBudgetView(budgetId: string, month: string): BudgetMonthView {
  const stored = readStoredBudgetView(budgetId, month);

  if (stored) {
    return cloneBudgetView(applyRegisterActivity(stored, month));
  }

  const starter = createStarterBudgetView(budgetId, month);
  return saveBudgetView(starter, month);
}

export const budgetViewService: BudgetViewService = {
  async getBudgetMonthView({ budgetId, month }) {
    return loadBudgetView(budgetId, month);
  },

  async getCategoryOptions({ budgetId, month }) {
    return getCategoryOptions(loadBudgetView(budgetId, month));
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
