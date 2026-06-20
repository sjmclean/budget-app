import type {
  BudgetCategoryGroupView,
  BudgetCategoryOption,
  CategoryMergePreview,
  BudgetCategoryView,
  BudgetMonthView,
  BudgetViewService,
} from "./budgetViewTypes";
import { readAccounts } from "../accounts/accountService";

const STORAGE_KEY_PREFIX = "budget-app.budget-view.v1";
const REGISTER_STORAGE_KEY = "budget-app.account-registers.v1";
const SCHEDULED_TRANSACTIONS_STORAGE_KEY = "budget-app.scheduled-transactions.v1";

interface StoredRegisterSplitLine {
  id: string;
  category: string;
  memo?: string;
  inflow: number;
  outflow: number;
}

interface StoredScheduledTransaction {
  id: string;
  category: string;
}

interface CategoryLocation {
  group: BudgetCategoryGroupView;
  category: BudgetCategoryView;
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
    isArchived: category.isArchived ?? false,
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
        isArchived: false,
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

function findCategoryLocation(view: BudgetMonthView, categoryId: string): CategoryLocation | null {
  for (const group of view.categoryGroups) {
    const category = group.categories.find((item) => item.id === categoryId);

    if (category) {
      return { group, category };
    }
  }

  return null;
}

function createCategoryReferenceMatcher(category: BudgetCategoryView): (value: string) => boolean {
  const sourceKeys = new Set([
    normaliseCategoryKey(category.id),
    normaliseCategoryKey(category.name),
  ]);

  return (value: string) => sourceKeys.has(normaliseCategoryKey(value));
}

function countRegisterCategoryReferences(category: BudgetCategoryView): {
  registerTransactionCount: number;
  registerSplitLineCount: number;
} {
  if (typeof window === "undefined") {
    return { registerTransactionCount: 0, registerSplitLineCount: 0 };
  }

  const raw = window.localStorage.getItem(REGISTER_STORAGE_KEY);

  if (!raw) {
    return { registerTransactionCount: 0, registerSplitLineCount: 0 };
  }

  try {
    const registers = JSON.parse(raw) as StoredRegisters;
    const matchesSourceCategory = createCategoryReferenceMatcher(category);
    let registerTransactionCount = 0;
    let registerSplitLineCount = 0;

    for (const register of Object.values(registers)) {
      for (const transaction of register.transactions ?? []) {
        if (matchesSourceCategory(transaction.category)) {
          registerTransactionCount += 1;
        }

        for (const splitLine of transaction.splitLines ?? []) {
          if (matchesSourceCategory(splitLine.category)) {
            registerSplitLineCount += 1;
          }
        }
      }
    }

    return { registerTransactionCount, registerSplitLineCount };
  } catch {
    return { registerTransactionCount: 0, registerSplitLineCount: 0 };
  }
}

function countScheduledCategoryReferences(category: BudgetCategoryView): number {
  if (typeof window === "undefined") {
    return 0;
  }

  const raw = window.localStorage.getItem(SCHEDULED_TRANSACTIONS_STORAGE_KEY);

  if (!raw) {
    return 0;
  }

  try {
    const scheduledTransactions = JSON.parse(raw) as StoredScheduledTransaction[];
    const matchesSourceCategory = createCategoryReferenceMatcher(category);

    return Array.isArray(scheduledTransactions)
      ? scheduledTransactions.filter((transaction) => matchesSourceCategory(transaction.category)).length
      : 0;
  } catch {
    return 0;
  }
}

function createCategoryMergePreview(
  view: BudgetMonthView,
  sourceCategoryId: string,
  targetCategoryId: string,
): CategoryMergePreview {
  if (sourceCategoryId === targetCategoryId) {
    throw new Error("Choose two different categories to preview a merge.");
  }

  const source = findCategoryLocation(view, sourceCategoryId);
  const target = findCategoryLocation(view, targetCategoryId);

  if (!source || !target) {
    throw new Error("Category not found.");
  }

  const registerCounts = countRegisterCategoryReferences(source.category);
  const scheduledTransactionCount = countScheduledCategoryReferences(source.category);

  return {
    sourceCategoryId: source.category.id,
    sourceCategoryName: source.category.name,
    sourceGroupName: source.group.name,
    sourceAssigned: source.category.assigned,
    sourceActivity: source.category.activity,
    sourceAvailable: source.category.available,
    sourceIsArchived: source.category.isArchived,
    targetCategoryId: target.category.id,
    targetCategoryName: target.category.name,
    targetGroupName: target.group.name,
    targetAssigned: target.category.assigned,
    targetActivity: target.category.activity,
    targetAvailable: target.category.available,
    targetIsArchived: target.category.isArchived,
    combinedAssigned: source.category.assigned + target.category.assigned,
    combinedActivity: source.category.activity + target.category.activity,
    combinedAvailable: source.category.available + target.category.available,
    registerTransactionCount: registerCounts.registerTransactionCount,
    registerSplitLineCount: registerCounts.registerSplitLineCount,
    scheduledTransactionCount,
  };
}


function rewriteStoredRegisterCategoryReferences(
  sourceCategory: BudgetCategoryView,
  targetCategory: BudgetCategoryView,
) {
  if (typeof window === "undefined") {
    return;
  }

  const raw = window.localStorage.getItem(REGISTER_STORAGE_KEY);

  if (!raw) {
    return;
  }

  try {
    const registers = JSON.parse(raw) as StoredRegisters;
    const matchesSourceCategory = createCategoryReferenceMatcher(sourceCategory);
    let changed = false;

    const rewriteValue = (value: string) => {
      if (!matchesSourceCategory(value)) {
        return value;
      }

      changed = true;
      return targetCategory.name;
    };

    for (const register of Object.values(registers)) {
      for (const transaction of register.transactions ?? []) {
        transaction.category = rewriteValue(transaction.category);

        for (const splitLine of transaction.splitLines ?? []) {
          splitLine.category = rewriteValue(splitLine.category);
        }
      }
    }

    if (changed) {
      window.localStorage.setItem(REGISTER_STORAGE_KEY, JSON.stringify(registers));
    }
  } catch {
    // If register storage is unreadable, leave transactions untouched.
  }
}

function rewriteScheduledCategoryReferences(
  sourceCategory: BudgetCategoryView,
  targetCategory: BudgetCategoryView,
) {
  if (typeof window === "undefined") {
    return;
  }

  const raw = window.localStorage.getItem(SCHEDULED_TRANSACTIONS_STORAGE_KEY);

  if (!raw) {
    return;
  }

  try {
    const scheduledTransactions = JSON.parse(raw) as StoredScheduledTransaction[];

    if (!Array.isArray(scheduledTransactions)) {
      return;
    }

    const matchesSourceCategory = createCategoryReferenceMatcher(sourceCategory);
    let changed = false;

    const nextScheduledTransactions = scheduledTransactions.map((transaction) => {
      if (!matchesSourceCategory(transaction.category)) {
        return transaction;
      }

      changed = true;
      return {
        ...transaction,
        category: targetCategory.name,
      };
    });

    if (changed) {
      window.localStorage.setItem(
        SCHEDULED_TRANSACTIONS_STORAGE_KEY,
        JSON.stringify(nextScheduledTransactions),
      );
    }
  } catch {
    // If scheduled transaction storage is unreadable, leave scheduled transactions untouched.
  }
}

function renameStoredRegisterCategory(oldName: string, newName: string) {
  if (typeof window === "undefined") {
    return;
  }

  const raw = window.localStorage.getItem(REGISTER_STORAGE_KEY);

  if (!raw) {
    return;
  }

  try {
    const registers = JSON.parse(raw) as StoredRegisters;
    const oldKey = normaliseCategoryKey(oldName);
    let changed = false;

    const renameValue = (value: string) => {
      if (normaliseCategoryKey(value) !== oldKey) {
        return value;
      }

      changed = true;
      return newName;
    };

    for (const register of Object.values(registers)) {
      for (const transaction of register.transactions ?? []) {
        transaction.category = renameValue(transaction.category);

        for (const splitLine of transaction.splitLines ?? []) {
          splitLine.category = renameValue(splitLine.category);
        }
      }
    }

    if (changed) {
      window.localStorage.setItem(REGISTER_STORAGE_KEY, JSON.stringify(registers));
    }
  } catch {
    // If register storage is unreadable, leave transactions untouched.
  }
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

  async getCategoryMergePreview({ budgetId, month, sourceCategoryId, targetCategoryId }) {
    return createCategoryMergePreview(
      loadBudgetView(budgetId, month),
      sourceCategoryId,
      targetCategoryId,
    );
  },

  async mergeCategory({ budgetId, month, sourceCategoryId, targetCategoryId }) {
    if (sourceCategoryId === targetCategoryId) {
      throw new Error("Choose two different categories to merge.");
    }

    const current = loadBudgetView(budgetId, month);
    const source = findCategoryLocation(current, sourceCategoryId);
    const target = findCategoryLocation(current, targetCategoryId);

    if (!source || !target) {
      throw new Error("Category not found.");
    }

    rewriteStoredRegisterCategoryReferences(source.category, target.category);
    rewriteScheduledCategoryReferences(source.category, target.category);

    const nextGroups = current.categoryGroups.map((group) => ({
      ...group,
      categories: group.categories.map((category) => {
        if (category.id === targetCategoryId) {
          return {
            ...category,
            assigned: category.assigned + source.category.assigned,
          };
        }

        if (category.id === sourceCategoryId) {
          return {
            ...category,
            assigned: 0,
            isArchived: true,
          };
        }

        return category;
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

  async renameCategory({ budgetId, month, categoryId, name }) {
    const trimmedName = name.trim();

    if (!trimmedName) {
      throw new Error("Category name cannot be blank.");
    }

    const current = loadBudgetView(budgetId, month);
    let previousName: string | null = null;
    let found = false;
    const newNameKey = normaliseCategoryKey(trimmedName);

    for (const group of current.categoryGroups) {
      for (const category of group.categories) {
        if (category.id !== categoryId && normaliseCategoryKey(category.name) === newNameKey) {
          throw new Error("A category with that name already exists.");
        }
      }
    }

    const nextGroups = current.categoryGroups.map((group) => ({
      ...group,
      categories: group.categories.map((category) => {
        if (category.id !== categoryId) {
          return category;
        }

        found = true;
        previousName = category.name;

        return {
          ...category,
          name: trimmedName,
        };
      }),
    }));

    if (!found || !previousName) {
      throw new Error("Category not found.");
    }

    if (normaliseCategoryKey(previousName) !== newNameKey) {
      renameStoredRegisterCategory(previousName, trimmedName);
    }

    return saveBudgetView(
      {
        ...current,
        categoryGroups: nextGroups,
      },
      month,
    );
  },

  async setCategoryArchived({ budgetId, month, categoryId, isArchived }) {
    const current = loadBudgetView(budgetId, month);
    let found = false;

    const nextGroups = current.categoryGroups.map((group) => ({
      ...group,
      categories: group.categories.map((category) => {
        if (category.id !== categoryId) {
          return category;
        }

        found = true;

        return {
          ...category,
          isArchived,
        };
      }),
    }));

    if (!found) {
      throw new Error("Category not found.");
    }

    return saveBudgetView(
      {
        ...current,
        categoryGroups: nextGroups,
      },
      month,
    );
  },
  async moveCategory({ budgetId, month, categoryId, direction }) {
    const current = loadBudgetView(budgetId, month);
    let moved = false;

    const nextGroups = current.categoryGroups.map((group) => {
      const categoryIndex = group.categories.findIndex(
        (category) => category.id === categoryId,
      );

      if (categoryIndex === -1) {
        return group;
      }

      const targetIndex = direction === "up" ? categoryIndex - 1 : categoryIndex + 1;

      if (targetIndex < 0 || targetIndex >= group.categories.length) {
        moved = true;
        return group;
      }

      const categories = [...group.categories];
      const [categoryToMove] = categories.splice(categoryIndex, 1);
      categories.splice(targetIndex, 0, categoryToMove);
      moved = true;

      return {
        ...group,
        categories,
      };
    });

    if (!moved) {
      throw new Error("Category not found.");
    }

    return saveBudgetView(
      {
        ...current,
        categoryGroups: nextGroups,
      },
      month,
    );
  },

  async moveCategoryGroup({ budgetId, month, groupId, direction }) {
    const current = loadBudgetView(budgetId, month);
    const groupIndex = current.categoryGroups.findIndex((group) => group.id === groupId);

    if (groupIndex === -1) {
      throw new Error("Category group not found.");
    }

    const targetIndex = direction === "up" ? groupIndex - 1 : groupIndex + 1;

    if (targetIndex < 0 || targetIndex >= current.categoryGroups.length) {
      return current;
    }

    const categoryGroups = [...current.categoryGroups];
    const [groupToMove] = categoryGroups.splice(groupIndex, 1);
    categoryGroups.splice(targetIndex, 0, groupToMove);

    return saveBudgetView(
      {
        ...current,
        categoryGroups,
      },
      month,
    );
  },

};
