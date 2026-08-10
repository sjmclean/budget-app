import type {
  BudgetCategoryGroupView,
  BudgetActivityDrilldown,
  BudgetActivityDrilldownRow,
  BudgetCategoryOption,
  CategoryMergePreview,
  BudgetCategoryView,
  BudgetMonthView,
  BudgetViewService,
  OverspendingHandling,
} from "./budgetViewTypes";

/**
 * @deprecated Historical key/value budgeting engine retained temporarily for
 * required migration-test fixtures only. Production composition must never
 * import this module; current budget reads and writes use
 * createSqliteBudgetViewService and the local-first projection worker.
 */
import type { BudgetActivityPersistencePort, BudgetActivityRegisterTransaction } from "./budgetActivityPersistencePort";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import { readSettingsPreferences } from "../settings/settingsPreferences";
import { cloneDefaultCategoryTemplate } from "./defaultCategoryTemplate";
import {
  readBudgetCreditCardBehaviour,
  readCreditCardPaymentFundingEnabled,
  shouldCreatePaymentCategories,
} from "./creditCardBehaviourService";
import {
  ensureCreditCardPaymentCategories,
  getCreditCardPaymentCategoryId,
} from "./creditCardPaymentCategories";
import { applyCategoryAssignedValues } from "./budgetMoneyMovement";
import { isMoneyNegative, normaliseMoney } from "./moneyMath";
import { applyCategoryEntities, syncCategoryEntities } from "./categoryEntities.js";
import { readBudgetMonthEntity, writeBudgetMonthEntity } from "./entities/budgetMonthEntity.js";

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

interface BudgetLoadContext {
  activitySnapshotPromise?: Promise<BudgetActivitySnapshot>;
}

interface BudgetActivitySnapshot {
  allTransactions: BudgetActivityRegisterTransaction[];
  transactionsByMonth: Map<string, BudgetActivityRegisterTransaction[]>;
}

function cloneBudgetView(view: BudgetMonthView): BudgetMonthView {
  return {
    ...view,
    categoryGroups: view.categoryGroups.map((group) => ({
      ...group,
      note: group.note ?? "",
      categories: group.categories.map((category) => ({
        ...category,
        overspendingHandling: category.overspendingHandling ?? "reduce-next-month",
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

function previousIsoMonth(month: string): string | null {
  const [year, monthNumber] = month.split("-").map(Number);

  if (!year || !monthNumber) {
    return null;
  }

  const previous = new Date(year, monthNumber - 2, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
}

function calculatePreviousOverspending(view: BudgetMonthView): number {
  return normaliseMoney(
    view.categoryGroups.reduce(
      (total, group) =>
        total +
        group.categories.reduce((groupTotal, category) => {
          if (
            category.available >= 0 ||
            (category.overspendingHandling ?? "reduce-next-month") === "carry-category"
          ) {
            return groupTotal;
          }

          return groupTotal + category.available;
        }, 0),
      0,
    ),
  );
}

function createRolloverBudgetView(
  previous: BudgetMonthView,
  month: string,
  existing?: BudgetMonthView | null,
): BudgetMonthView {
  const existingCategories = new Map(
    (existing?.categoryGroups ?? []).flatMap((group) =>
      group.categories.map((category) => [category.id, category] as const),
    ),
  );
  const carriedForwardReadyToAssign = previous.readyToAssign;
  const previousOverspending = calculatePreviousOverspending(previous);

  return {
    budgetId: previous.budgetId,
    budgetName: previous.budgetName,
    monthLabel: monthLabelFromIsoMonth(month),
    currencyCode: previous.currencyCode,
    readyToAssign: normaliseMoney(
      carriedForwardReadyToAssign + previousOverspending - (existing?.totalAssigned ?? 0),
    ),
    carriedForwardReadyToAssign,
    previousOverspending,
    incomeForMonth: existing?.incomeForMonth ?? 0,
    rolloverSourceMonth: previousIsoMonth(month) ?? undefined,
    totalAssigned: existing?.totalAssigned ?? 0,
    totalActivity: existing?.totalActivity ?? 0,
    totalAvailable: 0,
    categoryGroups: previous.categoryGroups.map((group) => ({
      ...group,
      previousAvailable: 0,
      assigned: 0,
      activity: 0,
      available: 0,
      categories: group.categories.map((category) => {
        const existingCategory = existingCategories.get(category.id);
        const shouldCarryNegative =
          category.available < 0 &&
          (category.overspendingHandling ?? "reduce-next-month") === "carry-category";
        const previousAvailable =
          category.available > 0 || shouldCarryNegative ? category.available : 0;

        return {
          ...category,
          previousAvailable,
          assigned: existingCategory?.assigned ?? 0,
          activity: 0,
          available: previousAvailable + (existingCategory?.assigned ?? 0),
          isOverspent: previousAvailable + (existingCategory?.assigned ?? 0) < 0,
          overspendingHandling:
            category.overspendingHandling ?? existingCategory?.overspendingHandling ?? "reduce-next-month",
          note: existingCategory?.note ?? category.note ?? "",
        };
      }),
    })),
  };
}

function isEmptyStarterMonth(view: BudgetMonthView): boolean {
  return (
    view.totalAssigned === 0 &&
    view.categoryGroups.every((group) =>
      group.categories.every(
        (category) => category.previousAvailable === 0 && category.assigned === 0,
      ),
    )
  );
}

function isLegacyGeneratedRolloverMonth(
  view: BudgetMonthView,
  previous: BudgetMonthView,
): boolean {
  if (
    view.rolloverSourceMonth !== undefined ||
    normaliseMoney(view.incomeForMonth ?? 0) !== 0 ||
    view.totalAssigned !== 0 ||
    view.totalActivity !== 0
  ) {
    return false;
  }

  const previousCategories = new Map(
    previous.categoryGroups.flatMap((group) =>
      group.categories.map((category) => [category.id, category] as const),
    ),
  );

  return view.categoryGroups.every((group) =>
    group.categories.every((category) => {
      const previousCategory = previousCategories.get(category.id);

      if (!previousCategory || category.assigned !== 0 || category.activity !== 0) {
        return false;
      }

      const shouldCarryNegative =
        previousCategory.available < 0 &&
        (previousCategory.overspendingHandling ?? "reduce-next-month") === "carry-category";
      const expectedPreviousAvailable =
        previousCategory.available > 0 || shouldCarryNegative ? previousCategory.available : 0;
      return (
        normaliseMoney(category.previousAvailable) === normaliseMoney(expectedPreviousAvailable) &&
        normaliseMoney(category.available) === normaliseMoney(expectedPreviousAvailable)
      );
    }),
  );
}

function shouldResolvePreviousRollover(view: BudgetMonthView): boolean {
  return (
    view.rolloverSourceMonth !== undefined ||
    isEmptyStarterMonth(view) ||
    (normaliseMoney(view.incomeForMonth ?? 0) === 0 &&
      view.totalAssigned === 0 &&
      view.totalActivity === 0)
  );
}

function recalculateCategory(category: BudgetCategoryView): BudgetCategoryView {
  const previousAvailable = category.previousAvailable ?? 0;
  const available = normaliseMoney(previousAvailable + category.assigned + category.activity);

  return {
    ...category,
    previousAvailable,
    isArchived: category.isArchived ?? false,
    overspendingHandling: category.overspendingHandling ?? "reduce-next-month",
    available,
    isOverspent: isMoneyNegative(available),
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

  const rolloverBase =
    view.carriedForwardReadyToAssign !== undefined ||
    view.previousOverspending !== undefined
      ? (view.carriedForwardReadyToAssign ?? 0) + (view.previousOverspending ?? 0)
      : 0;
  const incomeForMonth = view.incomeForMonth ?? 0;

  return {
    ...view,
    incomeForMonth,
    readyToAssign: normaliseMoney(rolloverBase + incomeForMonth - totalAssigned),
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
        overspendingHandling: "reduce-next-month",
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
  const stored = readBudgetMonthEntity(storage, budgetId, month);
  if (stored) return recalculateBudget(stored);

  // One-way compatibility bridge for pre-entity snapshots. The next save writes
  // the canonical replicated entity and does not recreate the aggregate key.
  const legacyRaw = storage.getItem(`budget-app.budget-view.v1.${budgetId}.${month}`);
  if (!legacyRaw) return null;
  try {
    return recalculateBudget(JSON.parse(legacyRaw) as BudgetMonthView);
  } catch {
    return null;
  }
}


async function getBudgetActivitySnapshot(
  dependencies: BudgetViewServiceDependencies,
  context: BudgetLoadContext,
): Promise<BudgetActivitySnapshot> {
  context.activitySnapshotPromise ??= (async () => {
    const allTransactions =
      await dependencies.budgetActivity.listRegisterTransactionsForBudgetActivity();
    const transactionsByMonth = new Map<string, BudgetActivityRegisterTransaction[]>();

    for (const transaction of allTransactions) {
      const transactionMonth = transaction.date.slice(0, 7);
      const monthTransactions = transactionsByMonth.get(transactionMonth);

      if (monthTransactions) {
        monthTransactions.push(transaction);
      } else {
        transactionsByMonth.set(transactionMonth, [transaction]);
      }
    }

    return { allTransactions, transactionsByMonth };
  })();

  return context.activitySnapshotPromise;
}

async function applyRegisterActivity(
  dependencies: BudgetViewServiceDependencies,
  view: BudgetMonthView,
  month: string,
  context: BudgetLoadContext,
): Promise<BudgetMonthView> {
  const activitySnapshot = await getBudgetActivitySnapshot(dependencies, context);
  const transactions = activitySnapshot.transactionsByMonth.get(month) ?? [];
  const allTransactions = activitySnapshot.allTransactions;
  const creditCardBehaviour = readBudgetCreditCardBehaviour(dependencies.storage, view.budgetId);
  const shouldUsePaymentFunding = readCreditCardPaymentFundingEnabled(
    dependencies.storage,
    view.budgetId,
  );
  const viewWithPaymentCategories = shouldCreatePaymentCategories({ creditCardBehaviour })
    ? ensureCreditCardPaymentCategories(dependencies, view, allTransactions)
    : view;
  const categoryLookup = createCategoryLookup(viewWithPaymentCategories);
  const accountTypeById = new Map(
    allTransactions.map((transaction) => [transaction.accountId, transaction.accountType]),
  );
  const activityByCategoryId = new Map<string, number>();
  const runningAvailableByCategoryId = new Map<string, number>();
  let readyToAssignIncome = 0;

  for (const group of viewWithPaymentCategories.categoryGroups) {
    for (const category of group.categories) {
      runningAvailableByCategoryId.set(
        category.id,
        normaliseMoney((category.previousAvailable ?? 0) + category.assigned),
      );
    }
  }

  function addCategoryActivity(categoryId: string, amount: number) {
    activityByCategoryId.set(
      categoryId,
      normaliseMoney((activityByCategoryId.get(categoryId) ?? 0) + amount),
    );
    runningAvailableByCategoryId.set(
      categoryId,
      normaliseMoney((runningAvailableByCategoryId.get(categoryId) ?? 0) + amount),
    );
  }

  function addCreditCardPaymentActivity(accountId: string, amount: number) {
    if (!shouldUsePaymentFunding || amount === 0) {
      return;
    }

    const paymentCategoryId = getCreditCardPaymentCategoryId(accountId);

    if (!categoryLookup.has(normaliseCategoryKey(paymentCategoryId))) {
      return;
    }

    addCategoryActivity(paymentCategoryId, amount);
  }

  function recordBudgetedActivity(input: {
    accountId: string;
    accountType?: string | null;
    categoryId: string;
    inflow: number;
    outflow: number;
  }) {
    const amount = input.inflow - input.outflow;
    const runningAvailableBeforeActivity = runningAvailableByCategoryId.get(input.categoryId) ?? 0;

    if (shouldUsePaymentFunding && input.accountType === "credit-card") {
      if (input.outflow > 0) {
        addCreditCardPaymentActivity(
          input.accountId,
          Math.min(input.outflow, Math.max(0, runningAvailableBeforeActivity)),
        );
      } else if (input.inflow > 0) {
        addCreditCardPaymentActivity(input.accountId, -input.inflow);
      }
    }

    addCategoryActivity(input.categoryId, amount);
  }

  for (const transaction of transactions) {
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

        recordBudgetedActivity({
          accountId: transaction.accountId,
          accountType: transaction.accountType,
          categoryId: splitCategoryId,
          inflow: splitLine.inflow,
          outflow: splitLine.outflow,
        });
      }

      continue;
    }

    const categoryKey = normaliseCategoryKey(transaction.category);
    const categoryId = resolveStoredCategoryId(transaction, categoryLookup);
    const amount = transaction.inflow - transaction.outflow;

    if (transaction.transferAccountId || isTransferCategory(categoryKey)) {
      if (transaction.transferAccountId) {
        const transferAccountType = accountTypeById.get(transaction.transferAccountId);

        if (categoryId && !isTransferCategory(categoryKey)) {
          recordBudgetedActivity({
            accountId: transaction.accountId,
            accountType: transaction.accountType,
            categoryId,
            inflow: transaction.inflow,
            outflow: transaction.outflow,
          });
        } else if (transferAccountType === "tracking") {
          readyToAssignIncome += amount;
        }

        if (shouldUsePaymentFunding && transferAccountType === "credit-card" && transaction.outflow > 0) {
          addCreditCardPaymentActivity(transaction.transferAccountId, -transaction.outflow);
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

    recordBudgetedActivity({
      accountId: transaction.accountId,
      accountType: transaction.accountType,
      categoryId,
      inflow: transaction.inflow,
      outflow: transaction.outflow,
    });
  }

  const recalculated = recalculateBudget({
    ...viewWithPaymentCategories,
    categoryGroups: viewWithPaymentCategories.categoryGroups.map((group) => ({
      ...group,
      categories: group.categories.map((category) => ({
        ...category,
        activity: activityByCategoryId.get(category.id) ?? 0,
      })),
    })),
  });

  const rolloverBase =
    recalculated.carriedForwardReadyToAssign !== undefined ||
    recalculated.previousOverspending !== undefined
      ? (recalculated.carriedForwardReadyToAssign ?? 0) +
        (recalculated.previousOverspending ?? 0)
      : 0;

  return {
    ...recalculated,
    incomeForMonth: normaliseMoney(readyToAssignIncome),
    readyToAssign: normaliseMoney(
      rolloverBase + readyToAssignIncome - recalculated.totalAssigned,
    ),
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
    if (transaction.date.slice(0, 7) !== month) {
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

    if (transaction.transferAccountId || isTransferCategory(categoryKey)) {
      if (
        transaction.transferAccountId &&
        transactionCategoryId === categoryId &&
        !isTransferCategory(categoryKey)
      ) {
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
  context: BudgetLoadContext = {},
): Promise<BudgetMonthView> {
  const next = await applyRegisterActivity(
    dependencies,
    recalculateBudget(view),
    month,
    context,
  );
  syncCategoryEntities(dependencies.storage, next);
  writeBudgetMonthEntity(dependencies.storage, next.budgetId, month, next);
  return cloneBudgetView(applyStoredSettings(dependencies, next));
}

async function loadBudgetView(
  dependencies: BudgetViewServiceDependencies,
  budgetId: string,
  month: string,
  context: BudgetLoadContext = {},
): Promise<BudgetMonthView> {
  const storedSnapshot = readStoredBudgetView(dependencies.storage, budgetId, month);
  const stored = storedSnapshot ? recalculateBudget(applyCategoryEntities(dependencies.storage, storedSnapshot)) : null;
  const previousMonth = previousIsoMonth(month);
  const previousStoredSnapshot = previousMonth
    ? readStoredBudgetView(dependencies.storage, budgetId, previousMonth)
    : null;
  const previousStored =
    previousMonth && previousStoredSnapshot
      ? shouldResolvePreviousRollover(previousStoredSnapshot)
        ? await loadBudgetView(dependencies, budgetId, previousMonth, context)
        : await applyRegisterActivity(
            dependencies,
            previousStoredSnapshot,
            previousMonth,
            context,
          )
      : null;

  if (previousMonth && previousStored) {
    const shouldRefreshRollover =
      !stored ||
      stored.rolloverSourceMonth === previousMonth ||
      isEmptyStarterMonth(stored) ||
      isLegacyGeneratedRolloverMonth(stored, previousStored);

    if (shouldRefreshRollover) {
      const rollover = createRolloverBudgetView(previousStored, month, stored);
      return saveBudgetView(
        dependencies,
        applyStoredSettings(dependencies, rollover),
        month,
        context,
      );
    }
  }

  if (stored) {
    return cloneBudgetView(
      applyStoredSettings(
        dependencies,
        await applyRegisterActivity(dependencies, stored, month, context),
      ),
    );
  }

  const starter = createStarterBudgetView(budgetId, month);
  return saveBudgetView(
    dependencies,
    applyStoredSettings(dependencies, starter),
    month,
    context,
  );
}

function slugifyCategoryIdentifier(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createUniqueCategoryIdentifier(
  name: string,
  existingIds: Set<string>,
  fallback: string,
): string {
  const base = slugifyCategoryIdentifier(name) || fallback;
  let candidate = base;
  let suffix = 2;

  while (existingIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function getCategoryOptions(view: BudgetMonthView): BudgetCategoryOption[] {
  return [
    {
      id: READY_TO_ASSIGN_CATEGORY_ID,
      name: READY_TO_ASSIGN_CATEGORY_NAME,
      groupId: "__income__",
      groupName: "Income",
    },
    ...view.categoryGroups.flatMap((group) =>
      group.categories.map((category) => ({
        id: category.id,
        name: category.name,
        groupId: group.id,
        groupName: group.name,
        isArchived: category.isArchived,
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

  async createCategory({ budgetId, month, name, groupId, groupName }) {
    const trimmedName = name.trim();
    const trimmedGroupName = groupName?.trim() ?? "";

    if (!trimmedName) {
      throw new Error("Category name cannot be blank.");
    }

    const current = await loadBudgetView(dependencies, budgetId, month);
    const categoryNameKey = normaliseCategoryKey(trimmedName);

    for (const group of current.categoryGroups) {
      if (
        group.categories.some(
          (category) => normaliseCategoryKey(category.name) === categoryNameKey,
        )
      ) {
        throw new Error("A category with that name already exists.");
      }
    }

    let targetGroup = groupId
      ? current.categoryGroups.find((group) => group.id === groupId)
      : undefined;

    const nextGroups = current.categoryGroups.map((group) => ({
      ...group,
      categories: [...group.categories],
    }));

    if (!targetGroup && trimmedGroupName) {
      targetGroup = current.categoryGroups.find(
        (group) =>
          normaliseCategoryKey(group.name) ===
          normaliseCategoryKey(trimmedGroupName),
      );
    }

    let targetGroupId = targetGroup?.id;

    if (!targetGroupId) {
      if (!trimmedGroupName) {
        throw new Error("Choose a category group.");
      }

      const existingGroupIds = new Set(nextGroups.map((group) => group.id));
      targetGroupId = createUniqueCategoryIdentifier(
        trimmedGroupName,
        existingGroupIds,
        "category-group",
      );
      nextGroups.push({
        id: targetGroupId,
        name: trimmedGroupName,
        previousAvailable: 0,
        assigned: 0,
        activity: 0,
        available: 0,
        note: "",
        categories: [],
      });
    }

    const existingCategoryIds = new Set(
      nextGroups.flatMap((group) =>
        group.categories.map((category) => category.id),
      ),
    );
    const categoryId = createUniqueCategoryIdentifier(
      trimmedName,
      existingCategoryIds,
      "category",
    );

    const targetGroupIndex = nextGroups.findIndex(
      (group) => group.id === targetGroupId,
    );
    if (targetGroupIndex < 0) {
      throw new Error("Category group was not found.");
    }

    const target = nextGroups[targetGroupIndex];
    nextGroups[targetGroupIndex] = {
      ...target,
      categories: [
        ...target.categories,
        {
          id: categoryId,
          name: trimmedName,
          previousAvailable: 0,
          assigned: 0,
          activity: 0,
          available: 0,
          isOverspent: false,
          isArchived: false,
          overspendingHandling: "reduce-next-month",
          note: "",
        },
      ],
    };

    return saveBudgetView(
      dependencies,
      {
        ...current,
        categoryGroups: nextGroups,
      },
      month,
    );
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

  async setCategoryAssignedValues({ budgetId, month, assignments }) {
    const current = await loadBudgetView(dependencies, budgetId, month);

    return saveBudgetView(
      dependencies,
      applyCategoryAssignedValues(current, assignments),
      month,
    );
  },

  async setCategoryOverspendingHandling({
    budgetId,
    month,
    categoryId,
    overspendingHandling,
  }: {
    budgetId: string;
    month: string;
    categoryId: string;
    overspendingHandling: OverspendingHandling;
  }) {
    const current = await loadBudgetView(dependencies, budgetId, month);
    let found = false;
    const categoryGroups = current.categoryGroups.map((group) => ({
      ...group,
      categories: group.categories.map((category) => {
        if (category.id !== categoryId) return category;
        found = true;
        return { ...category, overspendingHandling };
      }),
    }));

    if (!found) throw new Error("Category was not found.");

    return saveBudgetView(dependencies, { ...current, categoryGroups }, month);
  },

  async coverOverspending({ budgetId, month, overspentCategoryId, coveringCategoryId, amount }) {
    if (amount <= 0) {
      throw new Error("Cover amount must be positive.");
    }

    if (overspentCategoryId === coveringCategoryId) {
      throw new Error("Choose a different category to cover overspending.");
    }

    const current = await loadBudgetView(dependencies, budgetId, month);
    const overspentCategory = findCategoryById(current, overspentCategoryId);
    const coveringCategory = findCategoryById(current, coveringCategoryId);

    if (!overspentCategory) {
      throw new Error("Overspent category was not found.");
    }

    if (!coveringCategory) {
      throw new Error("Covering category was not found.");
    }

    const overspentAmount = Math.abs(Math.min(0, overspentCategory.available));

    if (overspentAmount <= 0) {
      throw new Error("Category is not overspent.");
    }

    if (amount > overspentAmount) {
      throw new Error("Cover amount cannot exceed the overspent amount.");
    }

    if (coveringCategory.available < amount) {
      throw new Error("Covering category has insufficient available funds.");
    }

    return saveBudgetView(
      dependencies,
      applyCategoryAssignedValues(current, [
        {
          categoryId: overspentCategoryId,
          assigned: normaliseMoney(overspentCategory.assigned + amount),
        },
        {
          categoryId: coveringCategoryId,
          assigned: normaliseMoney(coveringCategory.assigned - amount),
        },
      ]),
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

  async moveCategoryToPosition({ budgetId, month, categoryId, targetCategoryId, placement }) {
    const current = await loadBudgetView(dependencies, budgetId, month);

    if (categoryId === targetCategoryId) {
      return current;
    }

    let categoryToMove: BudgetCategoryView | null = null;

    const groupsWithoutSourceCategory = current.categoryGroups.map((group) => {
      const sourceIndex = group.categories.findIndex(
        (category) => category.id === categoryId,
      );

      if (sourceIndex === -1) {
        return group;
      }

      const categories = [...group.categories];
      [categoryToMove] = categories.splice(sourceIndex, 1);

      return {
        ...group,
        categories,
      };
    });

    if (!categoryToMove) {
      throw new Error("Category not found.");
    }

    const movedCategory = categoryToMove;
    let inserted = false;

    const nextGroups = groupsWithoutSourceCategory.map((group) => {
      const targetIndex = group.categories.findIndex(
        (category) => category.id === targetCategoryId,
      );

      if (targetIndex === -1) {
        return group;
      }

      const categories = [...group.categories];
      const insertIndex = placement === "before"
        ? targetIndex
        : targetIndex + 1;

      categories.splice(insertIndex, 0, movedCategory);
      inserted = true;

      return {
        ...group,
        categories,
      };
    });

    if (!inserted) {
      throw new Error("Target category not found.");
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

  async moveCategoryGroupToPosition({ budgetId, month, groupId, targetGroupId, placement }) {
    const current = await loadBudgetView(dependencies, budgetId, month);
    const groupIndex = current.categoryGroups.findIndex((group) => group.id === groupId);
    const targetIndex = current.categoryGroups.findIndex((group) => group.id === targetGroupId);

    if (groupIndex === -1 || targetIndex === -1) {
      throw new Error("Category group not found.");
    }

    if (groupId === targetGroupId) {
      return current;
    }

    const categoryGroups = [...current.categoryGroups];
    const [groupToMove] = categoryGroups.splice(groupIndex, 1);
    const adjustedTargetIndex = groupIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const insertIndex = placement === "before"
      ? adjustedTargetIndex
      : adjustedTargetIndex + 1;

    categoryGroups.splice(insertIndex, 0, groupToMove);

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
