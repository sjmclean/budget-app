import type {
  BudgetCategoryGroupView,
  BudgetActivityDrilldown,
  BudgetActivityDrilldownRow,
  BudgetCategoryOption,
  CategoryMergePreview,
  BudgetCategoryView,
  BudgetMonthView,
  BudgetViewService,
} from "./budgetViewTypes";
import type { BudgetActivityPersistencePort } from "./budgetActivityPersistencePort";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import { readSettingsPreferences } from "../settings/settingsPreferences";
import { cloneDefaultCategoryTemplate } from "./defaultCategoryTemplate";

const STORAGE_KEY_PREFIX = "budget-app.budget-view.v1";
const READY_TO_ASSIGN_CATEGORY_ID = "__ready_to_assign__";
const READY_TO_ASSIGN_CATEGORY_NAME = "Ready to Assign";

export interface BudgetViewServiceDependencies {
  budgetActivity: BudgetActivityPersistencePort;
  storage: KeyValueStoragePort;
}

interface CategoryLocation {
  group: BudgetCategoryGroupView;
  category: BudgetCategoryView;
}

function getStorageKey(budgetId: string, month: string): string {
  return `${STORAGE_KEY_PREFIX}.${budgetId}.${month}`;
}

function cloneBudgetView(view: BudgetMonthView): BudgetMonthView {
  return {
    ...view,
    categoryGroups: view.categoryGroups.map((group) => ({
      ...group,
      note: group.note ?? "",
      categories: group.categories.map((category) => ({
        ...category,
        note: category.note ?? "",
      })),
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
  const previousAvailable = category.previousAvailable ?? 0;
  const available = previousAvailable + category.assigned + category.activity;

  return {
    ...category,
    previousAvailable,
    isArchived: category.isArchived ?? false,
    available,
    isOverspent: available < 0,
  };
}

function recalculateGroup(group: BudgetCategoryGroupView): BudgetCategoryGroupView {
  const categories = group.categories.map(recalculateCategory);
  const previousAvailable = categories.reduce((sum, category) => sum + category.previousAvailable, 0);
  const assigned = categories.reduce((sum, category) => sum + category.assigned, 0);
  const activity = categories.reduce((sum, category) => sum + category.activity, 0);
  const available = categories.reduce((sum, category) => sum + category.available, 0);

  return {
    ...group,
    note: group.note ?? "",
    previousAvailable,
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
    categoryGroups: cloneDefaultCategoryTemplate().map((group) => ({
      id: group.id,
      name: group.name,
      previousAvailable: 0,
      assigned: 0,
      activity: 0,
      available: 0,
      note: "",
      categories: group.categories.map((category) => ({
        id: category.id,
        name: category.name,
        previousAvailable: 0,
        assigned: 0,
        activity: 0,
        available: 0,
        isOverspent: false,
        isArchived: false,
        note: "",
      })),
    })),
  });
}

function readStoredBudgetView(
  storage: KeyValueStoragePort,
  budgetId: string,
  month: string,
): BudgetMonthView | null {
  const raw = storage.getItem(getStorageKey(budgetId, month));

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


async function applyRegisterActivity(
  dependencies: BudgetViewServiceDependencies,
  view: BudgetMonthView,
  month: string,
): Promise<BudgetMonthView> {
  const categoryLookup = createCategoryLookup(view);
  const transactions = await dependencies.budgetActivity.listRegisterTransactionsForBudgetActivity();
  const accountTypeById = new Map(transactions.map((transaction) => [transaction.accountId, transaction.accountType]));
  const activityByCategoryId = new Map<string, number>();
  let readyToAssignIncome = 0;

  for (const transaction of transactions) {
    if (!transaction.date.startsWith(month)) {
      continue;
    }

    if (transaction.splitLines && transaction.splitLines.length > 0) {
      for (const splitLine of transaction.splitLines) {
        const splitCategoryKey = normaliseCategoryKey(splitLine.category);
        const splitCategoryId = resolveStoredCategoryId(splitLine, categoryLookup);
        const splitAmount = splitLine.inflow - splitLine.outflow;

        if (isReadyToAssignCategoryReference(splitLine, splitCategoryKey)) {
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
    const categoryId = resolveStoredCategoryId(transaction, categoryLookup);
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

    if (isReadyToAssignCategoryReference(transaction, categoryKey)) {
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

function findCategoryById(view: BudgetMonthView, categoryId: string): BudgetCategoryView | null {
  for (const group of view.categoryGroups) {
    const category = group.categories.find((item) => item.id === categoryId);

    if (category) {
      return category;
    }
  }

  return null;
}

function createActivityRow(input: {
  transaction: {
    id: string;
    accountId: string;
    accountName?: string;
    date: string;
    payee?: string;
    memo?: string;
  };
  categoryId: string;
  categoryName: string;
  inflow: number;
  outflow: number;
  splitLineId?: string;
  splitMemo?: string;
  isSplit: boolean;
}): BudgetActivityDrilldownRow {
  return {
    id: input.splitLineId
      ? `${input.transaction.id}:${input.splitLineId}`
      : input.transaction.id,
    transactionId: input.transaction.id,
    splitLineId: input.splitLineId,
    accountId: input.transaction.accountId,
    accountName: input.transaction.accountName ?? input.transaction.accountId,
    date: input.transaction.date,
    payee: input.transaction.payee?.trim() || "Unspecified payee",
    memo: input.splitMemo ?? input.transaction.memo ?? "",
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    inflow: input.inflow,
    outflow: input.outflow,
    amount: input.inflow - input.outflow,
    isSplit: input.isSplit,
  };
}

async function createCategoryActivityDrilldown(
  dependencies: BudgetViewServiceDependencies,
  view: BudgetMonthView,
  month: string,
  categoryId: string,
): Promise<BudgetActivityDrilldown> {
  const category = findCategoryById(view, categoryId);

  if (!category) {
    throw new Error("Category not found.");
  }

  const categoryLookup = createCategoryLookup(view);
  const rows: BudgetActivityDrilldownRow[] = [];
  const transactions = await dependencies.budgetActivity.listRegisterTransactionsForBudgetActivity();

  for (const transaction of transactions) {
    if (!transaction.date.startsWith(month)) {
      continue;
    }

    if (transaction.splitLines && transaction.splitLines.length > 0) {
      for (const splitLine of transaction.splitLines) {
        const splitCategoryKey = normaliseCategoryKey(splitLine.category);
        const splitCategoryId = resolveStoredCategoryId(splitLine, categoryLookup);

        if (isReadyToAssignCategoryReference(splitLine, splitCategoryKey)) {
          continue;
        }

        if (splitCategoryId !== categoryId) {
          continue;
        }

        rows.push(
          createActivityRow({
            transaction,
            categoryId: splitCategoryId,
            categoryName: splitLine.category || category.name,
            inflow: splitLine.inflow,
            outflow: splitLine.outflow,
            splitLineId: splitLine.id,
            splitMemo: splitLine.memo,
            isSplit: true,
          }),
        );
      }

      continue;
    }

    const categoryKey = normaliseCategoryKey(transaction.category);
    const transactionCategoryId = resolveStoredCategoryId(transaction, categoryLookup);

    if (isTransferCategory(categoryKey)) {
      continue;
    }

    if (isReadyToAssignCategoryReference(transaction, categoryKey)) {
      continue;
    }

    if (transactionCategoryId !== categoryId) {
      continue;
    }

    rows.push(
      createActivityRow({
        transaction,
        categoryId: transactionCategoryId,
        categoryName: transaction.category || category.name,
        inflow: transaction.inflow,
        outflow: transaction.outflow,
        isSplit: false,
      }),
    );
  }

  const sortedRows = rows.sort((left, right) =>
    left.date.localeCompare(right.date) ||
    left.payee.localeCompare(right.payee) ||
    left.transactionId.localeCompare(right.transactionId),
  );
  const totalInflow = sortedRows.reduce((sum, row) => sum + row.inflow, 0);
  const totalOutflow = sortedRows.reduce((sum, row) => sum + row.outflow, 0);

  return {
    budgetId: view.budgetId,
    month,
    monthLabel: view.monthLabel,
    categoryId: category.id,
    categoryName: category.name,
    currencyCode: view.currencyCode,
    rows: sortedRows,
    totalInflow,
    totalOutflow,
    netActivity: totalInflow - totalOutflow,
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

function resolveStoredCategoryId(
  item: { category: string; categoryId?: string },
  categoryLookup: Map<string, string>,
): string | undefined {
  if (item.categoryId) {
    const categoryId = categoryLookup.get(normaliseCategoryKey(item.categoryId));

    if (categoryId) {
      return categoryId;
    }
  }

  return categoryLookup.get(normaliseCategoryKey(item.category));
}

function isReadyToAssignCategoryReference(
  item: { category: string; categoryId?: string },
  categoryKey: string,
): boolean {
  return (
    Boolean(item.categoryId && isReadyToAssignCategory(normaliseCategoryKey(item.categoryId))) ||
    isReadyToAssignCategory(categoryKey)
  );
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

function applyStoredSettings(
  dependencies: BudgetViewServiceDependencies,
  view: BudgetMonthView,
): BudgetMonthView {
  const settings = readSettingsPreferences(dependencies.storage);

  return {
    ...view,
    budgetName: settings.budget.budgetName,
    currencyCode: settings.budget.currencyCode,
  };
}

async function saveBudgetView(
  dependencies: BudgetViewServiceDependencies,
  view: BudgetMonthView,
  month: string,
): Promise<BudgetMonthView> {
  const next = await applyRegisterActivity(dependencies, recalculateBudget(view), month);
  dependencies.storage.setItem(getStorageKey(next.budgetId, month), JSON.stringify(next));
  return cloneBudgetView(applyStoredSettings(dependencies, next));
}

async function loadBudgetView(
  dependencies: BudgetViewServiceDependencies,
  budgetId: string,
  month: string,
): Promise<BudgetMonthView> {
  const stored = readStoredBudgetView(dependencies.storage, budgetId, month);

  if (stored) {
    return cloneBudgetView(applyStoredSettings(dependencies, await applyRegisterActivity(dependencies, stored, month)));
  }

  const starter = createStarterBudgetView(budgetId, month);
  return saveBudgetView(dependencies, applyStoredSettings(dependencies, starter), month);
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

async function createCategoryMergePreview(
  dependencies: BudgetViewServiceDependencies,
  view: BudgetMonthView,
  sourceCategoryId: string,
  targetCategoryId: string,
): Promise<CategoryMergePreview> {
  if (sourceCategoryId === targetCategoryId) {
    throw new Error("Choose two different categories to preview a merge.");
  }

  const source = findCategoryLocation(view, sourceCategoryId);
  const target = findCategoryLocation(view, targetCategoryId);

  if (!source || !target) {
    throw new Error("Category not found.");
  }

  const referenceCounts = await dependencies.budgetActivity.countCategoryReferences({
    id: source.category.id,
    name: source.category.name,
  });

  return {
    sourceCategoryId: source.category.id,
    sourceCategoryName: source.category.name,
    sourceGroupName: source.group.name,
    sourcePreviousAvailable: source.category.previousAvailable,
    sourceAssigned: source.category.assigned,
    sourceActivity: source.category.activity,
    sourceAvailable: source.category.available,
    sourceIsArchived: source.category.isArchived,
    targetCategoryId: target.category.id,
    targetCategoryName: target.category.name,
    targetGroupName: target.group.name,
    targetPreviousAvailable: target.category.previousAvailable,
    targetAssigned: target.category.assigned,
    targetActivity: target.category.activity,
    targetAvailable: target.category.available,
    targetIsArchived: target.category.isArchived,
    combinedPreviousAvailable: source.category.previousAvailable + target.category.previousAvailable,
    combinedAssigned: source.category.assigned + target.category.assigned,
    combinedActivity: source.category.activity + target.category.activity,
    combinedAvailable: source.category.available + target.category.available,
    registerTransactionCount: referenceCounts.registerTransactionCount,
    registerSplitLineCount: referenceCounts.registerSplitLineCount,
    scheduledTransactionCount: referenceCounts.scheduledTransactionCount,
  };
}

export function createBudgetViewService(
  dependencies: BudgetViewServiceDependencies,
): BudgetViewService {
  return {
  async getBudgetMonthView({ budgetId, month }) {
    return loadBudgetView(dependencies, budgetId, month);
  },

  async getCategoryMergePreview({ budgetId, month, sourceCategoryId, targetCategoryId }) {
    return createCategoryMergePreview(
      dependencies,
      await loadBudgetView(dependencies, budgetId, month),
      sourceCategoryId,
      targetCategoryId,
    );
  },

  async mergeCategory({ budgetId, month, sourceCategoryId, targetCategoryId }) {
    if (sourceCategoryId === targetCategoryId) {
      throw new Error("Choose two different categories to merge.");
    }

    const current = await loadBudgetView(dependencies, budgetId, month);
    const source = findCategoryLocation(current, sourceCategoryId);
    const target = findCategoryLocation(current, targetCategoryId);

    if (!source || !target) {
      throw new Error("Category not found.");
    }

    await dependencies.budgetActivity.rewriteCategoryReferences({
      sourceCategory: source.category,
      targetCategory: target.category,
    });

    const nextGroups = current.categoryGroups.map((group) => ({
      ...group,
      categories: group.categories.map((category) => {
        if (category.id === targetCategoryId) {
          return {
            ...category,
            previousAvailable: category.previousAvailable + source.category.previousAvailable,
            assigned: category.assigned + source.category.assigned,
          };
        }

        if (category.id === sourceCategoryId) {
          return {
            ...category,
            previousAvailable: 0,
            assigned: 0,
            isArchived: true,
          };
        }

        return category;
      }),
    }));

    return saveBudgetView(dependencies,
      {
        ...current,
        categoryGroups: nextGroups,
      },
      month,
    );
  },

  async getCategoryOptions({ budgetId, month }) {
    return getCategoryOptions(await loadBudgetView(dependencies, budgetId, month));
  },

  async getCategoryActivityDrilldown({ budgetId, month, categoryId }) {
    return createCategoryActivityDrilldown(
      dependencies,
      await loadBudgetView(dependencies, budgetId, month),
      month,
      categoryId,
    );
  },

  async updateAssigned({ budgetId, month, categoryId, assigned }) {
    const current = await loadBudgetView(dependencies, budgetId, month);
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

    return saveBudgetView(dependencies,
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

    const current = await loadBudgetView(dependencies, budgetId, month);
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
      await dependencies.budgetActivity.renameRegisterCategoryReferences({
        previousName,
        nextName: trimmedName,
      });
    }

    return saveBudgetView(dependencies,
      {
        ...current,
        categoryGroups: nextGroups,
      },
      month,
    );
  },

  async setCategoryArchived({ budgetId, month, categoryId, isArchived }) {
    const current = await loadBudgetView(dependencies, budgetId, month);
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

    return saveBudgetView(dependencies,
      {
        ...current,
        categoryGroups: nextGroups,
      },
      month,
    );
  },
  async moveCategory({ budgetId, month, categoryId, direction }) {
    const current = await loadBudgetView(dependencies, budgetId, month);
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

    return saveBudgetView(dependencies,
      {
        ...current,
        categoryGroups: nextGroups,
      },
      month,
    );
  },

  async moveCategoryGroup({ budgetId, month, groupId, direction }) {
    const current = await loadBudgetView(dependencies, budgetId, month);
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

    return saveBudgetView(dependencies,
      {
        ...current,
        categoryGroups,
      },
      month,
    );
  },

  async updateCategoryNote({ budgetId, month, categoryId, note }) {
    const current = await loadBudgetView(dependencies, budgetId, month);
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
          note,
        };
      }),
    }));

    if (!found) {
      throw new Error("Category not found.");
    }

    return saveBudgetView(dependencies,
      {
        ...current,
        categoryGroups: nextGroups,
      },
      month,
    );
  },

  async updateCategoryGroupNote({ budgetId, month, groupId, note }) {
    const current = await loadBudgetView(dependencies, budgetId, month);
    let found = false;

    const categoryGroups = current.categoryGroups.map((group) => {
      if (group.id !== groupId) {
        return group;
      }

      found = true;

      return {
        ...group,
        note,
      };
    });

    if (!found) {
      throw new Error("Category group not found.");
    }

    return saveBudgetView(dependencies,
      {
        ...current,
        categoryGroups,
      },
      month,
    );
  },

  };
}
