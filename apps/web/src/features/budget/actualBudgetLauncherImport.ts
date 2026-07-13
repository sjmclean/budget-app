import {
  BUDGET_REGISTRY_STORAGE_KEY,
  createBudgetRegistryEntry,
  markBudgetOpened,
  readBudgetRegistry,
  type BudgetSummary,
} from "./budgetRegistry";
import {
  SELECTED_BUDGET_STORAGE_KEY,
  getBudgetScopedStorageKey,
} from "./budgetDataScope";
import type { FullBudgetImportPreview } from "../../../../../packages/types/src/index";
import type { CreditCardBehaviour } from "./budgetPreferences";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import type { SidebarAccount, SidebarAccountType } from "../accounts/accountService";
import type { AccountRegisterView, RegisterTransactionView } from "../accounts/accountRegisterTypes";
import type { PayeeView } from "../accounts/payeeService";
import type { BudgetCategoryGroupView, BudgetMonthView } from "./budgetViewTypes";
import { isMoneyNegative, normaliseMoney } from "./moneyMath";

export const ACTUAL_BUDGET_LAUNCHER_IMPORT_STORAGE_PREFIX =
  "budget-app.actual-budget-launcher-import.v1";

const ACCOUNTS_STORAGE_KEY = "budget-app.accounts.v1";
const REGISTERS_STORAGE_KEY = "budget-app.account-registers.v1";
const PAYEES_STORAGE_KEY = "budget-app.payees.v1";
const SCHEDULED_STORAGE_KEY = "budget-app.scheduled-transactions.v1";
const BUDGET_VIEW_STORAGE_PREFIX = "budget-app.budget-view.v1";
const READY_TO_ASSIGN_CATEGORY_ID = "__ready_to_assign__";
const READY_TO_ASSIGN_CATEGORY_NAME = "Ready to Assign";

export interface ActualBudgetLauncherImportRecord {
  budgetId: string;
  budgetName: string;
  sourceBudgetName: string | null;
  sourceFileName: string | null;
  mode: "new-budget";
  status: "completed";
  importedAt: string;
  counts: {
    accounts: number;
    categoryGroups: number;
    categories: number;
    payees: number;
    transactions: number;
    transfers: number;
  };
  skipped: Array<{ label: string; count: number; reason: string }>;
  warnings: string[];
  progressSteps: Array<{
    phase: string;
    label: string;
    detail?: string;
  }>;
}

export interface CreateActualBudgetLauncherImportInput {
  preview: FullBudgetImportPreview;
  sourceFileName?: string | null;
  creditCardBehaviour?: CreditCardBehaviour;
  now?: Date;
}

export interface ActualBudgetLauncherImportResult {
  budget: BudgetSummary;
  record: ActualBudgetLauncherImportRecord;
  budgets: BudgetSummary[];
}

interface ActualImportMaps {
  accountIdBySourceId: Map<string, string>;
  accountNameById: Map<string, string>;
  accountTypeById: Map<string, SidebarAccountType>;
  categoryIdBySourceId: Map<string, string>;
  categoryNameById: Map<string, string>;
  payeeIdBySourceId: Map<string, string>;
  payeeNameById: Map<string, string>;
}

export function getActualBudgetLauncherImportStorageKey(budgetId: string): string {
  return `${ACTUAL_BUDGET_LAUNCHER_IMPORT_STORAGE_PREFIX}.${budgetId}`;
}

export function readActualBudgetLauncherImportRecord(
  storage: KeyValueStoragePort,
  budgetId: string,
): ActualBudgetLauncherImportRecord | null {
  const raw = storage.getItem(getActualBudgetLauncherImportStorageKey(budgetId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as ActualBudgetLauncherImportRecord;
    return parsed && parsed.budgetId === budgetId ? parsed : null;
  } catch {
    return null;
  }
}

export async function createActualBudgetLauncherImportWithBackend(
  storage: KeyValueStoragePort,
  input: CreateActualBudgetLauncherImportInput,
): Promise<ActualBudgetLauncherImportResult> {
  const registryBeforeImport = storage.getItem(BUDGET_REGISTRY_STORAGE_KEY);
  const selectedBudgetBeforeImport = storage.getItem(SELECTED_BUDGET_STORAGE_KEY);
  const keysBeforeImport = new Set(storage.listKeys?.() ?? []);
  let result: ActualBudgetLauncherImportResult | null = null;

  try {
    result = createActualBudgetLauncherImport(storage, input);
    await storage.flush?.();
    return result;
  } catch (error) {
    rollbackActualBudgetLauncherImport(storage, {
      budgetId: result?.budget.id ?? null,
      keysBeforeImport,
      registryBeforeImport,
      selectedBudgetBeforeImport,
    });
    await storage.flush?.();
    throw error;
  }
}

export function createActualBudgetLauncherImport(
  storage: KeyValueStoragePort,
  input: CreateActualBudgetLauncherImportInput,
): ActualBudgetLauncherImportResult {
  validateActualPreviewForImport(input.preview);

  const registryBeforeImport = storage.getItem(BUDGET_REGISTRY_STORAGE_KEY);
  const selectedBudgetBeforeImport = storage.getItem(SELECTED_BUDGET_STORAGE_KEY);
  const keysBeforeImport = new Set(storage.listKeys?.() ?? []);
  const now = input.now ?? new Date();
  let budget: BudgetSummary | null = null;

  try {
    const budgetName = createImportedActualBudgetName(input.preview.sourceBudgetName);
    budget = createBudgetRegistryEntry(storage, {
      name: budgetName,
      currency: readPreviewCurrency(input.preview),
      packagePath: input.sourceFileName
        ? `~/Budgets/${input.sourceFileName.replace(/\.zip$/i, "")}.budget`
        : undefined,
      preferences: input.creditCardBehaviour
        ? { creditCardBehaviour: input.creditCardBehaviour }
        : undefined,
      now,
    });

    const persistenceWarnings = writeImportedActualBudgetData(storage, budget, input.preview, now);
    markBudgetOpened(storage, budget.id, now);
    storage.setItem(SELECTED_BUDGET_STORAGE_KEY, budget.id);

    const record: ActualBudgetLauncherImportRecord = {
      budgetId: budget.id,
      budgetName: budget.name,
      sourceBudgetName: input.preview.sourceBudgetName,
      sourceFileName: input.sourceFileName ?? null,
      mode: "new-budget",
      status: "completed",
      importedAt: now.toISOString(),
      counts: {
        accounts: input.preview.accounts.length,
        categoryGroups: input.preview.categoryGroups.length,
        categories: input.preview.categories.length,
        payees: input.preview.payees.length,
        transactions: input.preview.transactions.length,
        transfers: input.preview.transferCount,
      },
      skipped: input.preview.entityCounts
        .filter((item) => !item.supported && item.count > 0)
        .map((item) => ({ label: item.label, count: item.count, reason: item.note ?? "Not imported yet" })),
      warnings: [
        ...input.preview.issues.map((issue) => issue.message),
        ...persistenceWarnings,
      ],
      progressSteps: [
        { phase: "create-budget", label: "Created imported budget", detail: budget.name },
        { phase: "accounts", label: "Imported accounts", detail: String(input.preview.accounts.length) },
        { phase: "categories", label: "Imported categories", detail: String(input.preview.categories.length) },
        { phase: "payees", label: "Imported payees", detail: String(input.preview.payees.length) },
        { phase: "transactions", label: "Imported transactions", detail: String(input.preview.transactions.length) },
      ],
    };

    storage.setItem(
      getActualBudgetLauncherImportStorageKey(budget.id),
      JSON.stringify(record),
    );

    const openedBudget = markBudgetOpened(storage, budget.id, now) ?? budget;

    return {
      budget: openedBudget,
      record,
      budgets: readBudgetRegistry(storage),
    };
  } catch (error) {
    rollbackActualBudgetLauncherImport(storage, {
      budgetId: budget?.id ?? null,
      keysBeforeImport,
      registryBeforeImport,
      selectedBudgetBeforeImport,
    });

    if (isStorageQuotaError(error)) {
      throw new Error(
        "Actual Budget import requires more browser storage than localStorage allows. No budget was created and no partial data was saved.",
        { cause: error },
      );
    }

    throw error;
  }
}

function validateActualPreviewForImport(preview: FullBudgetImportPreview): void {
  if (preview.format !== "actual-budget") {
    throw new Error("Only Actual Budget previews can be imported by the Actual launcher import service.");
  }
  if (preview.accounts.length === 0) {
    throw new Error("Actual Budget import requires at least one account.");
  }
  if (preview.transactions.length === 0) {
    throw new Error("Actual Budget import requires at least one transaction.");
  }
  const blockingIssue = preview.issues.find((issue) => issue.severity === "error");
  if (blockingIssue) {
    throw new Error(`Actual Budget import cannot continue: ${blockingIssue.message}`);
  }
}

function createImportedActualBudgetName(sourceName: string | null): string {
  const baseName = sourceName?.trim() || "Actual Budget";
  return `${baseName} Imported`;
}

function readPreviewCurrency(preview: FullBudgetImportPreview): string {
  const value = preview.metadata.currency;
  return typeof value === "string" && value.trim() ? value.trim().toUpperCase() : "AUD";
}

function writeImportedActualBudgetData(
  storage: KeyValueStoragePort,
  budget: BudgetSummary,
  preview: FullBudgetImportPreview,
  now: Date,
): string[] {
  const nowIso = now.toISOString();
  const maps: ActualImportMaps = {
    accountIdBySourceId: new Map(),
    accountNameById: new Map(),
    accountTypeById: new Map(),
    categoryIdBySourceId: new Map(),
    categoryNameById: new Map(),
    payeeIdBySourceId: new Map(),
    payeeNameById: new Map(),
  };

  const accounts = mapActualAccounts(preview, maps, nowIso);
  const categoryGroups = mapActualCategoryGroups(preview, maps);
  const payees = mapActualPayees(preview, maps, nowIso);
  const registers = mapActualRegisters(preview, accounts, maps);
  const monthViews = mapActualBudgetMonthViews(budget, categoryGroups, registers, preview, maps, now);

  writeScopedJson(storage, budget.id, ACCOUNTS_STORAGE_KEY, accounts);
  writeScopedJson(storage, budget.id, PAYEES_STORAGE_KEY, payees);
  writeScopedJson(storage, budget.id, REGISTERS_STORAGE_KEY, registers);
  writeScopedJson(storage, budget.id, SCHEDULED_STORAGE_KEY, []);

  for (const [month, view] of monthViews) {
    writeBudgetMonthView(storage, budget.id, month, view);
  }

  const unsupportedWarnings = preview.entityCounts
    .filter((item) => !item.supported && item.count > 0)
    .map((item) => `${item.label} (${item.count.toLocaleString()}) ${item.note ?? "not imported yet"}.`);

  return unsupportedWarnings;
}

function writeScopedJson(storage: KeyValueStoragePort, budgetId: string, key: string, value: unknown): void {
  storage.setItem(getBudgetScopedStorageKey(budgetId, key), JSON.stringify(value));
}

function writeBudgetMonthView(
  storage: KeyValueStoragePort,
  budgetId: string,
  month: string,
  view: BudgetMonthView,
): void {
  const serialized = JSON.stringify(view);
  const legacyKey = `${BUDGET_VIEW_STORAGE_PREFIX}.${budgetId}.${month}`;

  storage.setItem(legacyKey, serialized);
  storage.setItem(getBudgetScopedStorageKey(budgetId, legacyKey), serialized);
}

function mapActualAccounts(preview: FullBudgetImportPreview, maps: ActualImportMaps, nowIso: string): SidebarAccount[] {
  const existingIds = new Set<string>();
  return preview.accounts.map((account, index) => {
    const id = uniqueSlug(account.name || account.id || `Actual Account ${index + 1}`, existingIds, "account");
    maps.accountIdBySourceId.set(account.id, id);
    maps.accountNameById.set(id, account.name);
    const type = mapActualAccountType(account.type, account.offBudget);
    maps.accountTypeById.set(id, type);
    return {
      id,
      name: account.name || `Actual Account ${index + 1}`,
      type,
      startingBalance: 0,
      createdAt: nowIso,
      closedAt: account.closed ? nowIso : null,
    };
  });
}

function mapActualAccountType(type: string | null, offBudget: boolean): SidebarAccountType {
  if (offBudget) return "tracking";
  const normalized = (type ?? "").replace(/[\s_-]/g, "").toLowerCase();
  if (["credit", "creditcard", "card"].includes(normalized)) return "credit-card";
  if (["investment", "brokerage", "asset", "liability", "loan", "mortgage"].includes(normalized)) return "tracking";
  return "on-budget";
}

function isActualHiddenCategoryGroupName(name: string | null | undefined): boolean {
  return (name ?? "").trim().toLowerCase() === "hidden categories";
}

function isActualBudgetCategoryImportable(
  category: FullBudgetImportPreview["categories"][number],
  group: FullBudgetImportPreview["categoryGroups"][number] | null,
): boolean {
  if (category.hidden || category.isIncome === true) return false;
  if (!group) return true;
  if (group.hidden || group.isIncome === true) return false;
  if (isActualHiddenCategoryGroupName(group.name)) return false;
  return true;
}

function mapActualCategoryGroups(preview: FullBudgetImportPreview, maps: ActualImportMaps): BudgetCategoryGroupView[] {
  const existingGroupIds = new Set<string>();
  const existingCategoryIds = new Set<string>();
  const sortedGroups = [...preview.categoryGroups].sort(compareActualSortOrder);
  const groups = sortedGroups.map((group, groupIndex) => {
    const groupId = uniqueSlug(group.name || group.id || `Actual Group ${groupIndex + 1}`, existingGroupIds, "group");
    const categories = preview.categories
      .filter((category) => category.groupId === group.id && isActualBudgetCategoryImportable(category, group))
      .sort(compareActualSortOrder)
      .map((category, categoryIndex) => {
        const categoryId = uniqueSlug(category.name || category.id || `Actual Category ${categoryIndex + 1}`, existingCategoryIds, "category");
        maps.categoryIdBySourceId.set(category.id, categoryId);
        maps.categoryNameById.set(categoryId, category.name);
        return {
          id: categoryId,
          name: category.name || `Actual Category ${categoryIndex + 1}`,
          previousAvailable: 0,
          assigned: 0,
          activity: 0,
          available: 0,
          isOverspent: false,
          isArchived: group.hidden || category.hidden,
          note: "",
        };
      });

    return {
      id: groupId,
      name: group.name || `Actual Group ${groupIndex + 1}`,
      previousAvailable: 0,
      assigned: 0,
      activity: 0,
      available: 0,
      note: "",
      categories,
    };
  }).filter((group) => group.categories.length > 0);

  const knownGroupIds = new Set(preview.categoryGroups.map((group) => group.id));
  const ungrouped = preview.categories
    .filter((category) => (!category.groupId || !knownGroupIds.has(category.groupId)) && isActualBudgetCategoryImportable(category, null))
    .sort(compareActualSortOrder);
  if (ungrouped.length > 0) {
    groups.push({
      id: uniqueSlug("Imported Categories", existingGroupIds, "group"),
      name: "Imported Categories",
      previousAvailable: 0,
      assigned: 0,
      activity: 0,
      available: 0,
      note: "",
      categories: ungrouped.map((category, categoryIndex) => {
        const categoryId = uniqueSlug(category.name || category.id || `Actual Category ${categoryIndex + 1}`, existingCategoryIds, "category");
        maps.categoryIdBySourceId.set(category.id, categoryId);
        maps.categoryNameById.set(categoryId, category.name);
        return {
          id: categoryId,
          name: category.name || `Actual Category ${categoryIndex + 1}`,
          previousAvailable: 0,
          assigned: 0,
          activity: 0,
          available: 0,
          isOverspent: false,
          isArchived: category.hidden,
          note: "",
        };
      }),
    });
  }

  return groups;
}

function compareActualSortOrder<T extends { sortOrder?: number | null; name?: string | null; id?: string | null }>(a: T, b: T): number {
  const aSort = typeof a.sortOrder === "number" && Number.isFinite(a.sortOrder) ? a.sortOrder : Number.POSITIVE_INFINITY;
  const bSort = typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder) ? b.sortOrder : Number.POSITIVE_INFINITY;
  if (aSort !== bSort) return aSort - bSort;
  return (a.name ?? a.id ?? "").localeCompare(b.name ?? b.id ?? "");
}

function mapActualPayees(preview: FullBudgetImportPreview, maps: ActualImportMaps, nowIso: string): PayeeView[] {
  const existingIds = new Set<string>();
  const transactionCountByPayeeId = new Map<string, number>();
  for (const transaction of preview.transactions) {
    if (transaction.payeeId) {
      transactionCountByPayeeId.set(transaction.payeeId, (transactionCountByPayeeId.get(transaction.payeeId) ?? 0) + 1);
    }
  }

  return preview.payees.flatMap((payee) => {
    if (!payee.name || payee.name.toLowerCase().startsWith("transfer:")) {
      return [];
    }
    const id = uniqueSlug(payee.name, existingIds, "payee");
    maps.payeeIdBySourceId.set(payee.id, id);
    maps.payeeNameById.set(id, payee.name);
    return [{
      id,
      name: payee.name,
      createdAt: nowIso,
      lastUsedAt: nowIso,
      useCount: transactionCountByPayeeId.get(payee.id) ?? 1,
      isArchived: false,
    }];
  });
}

function mapActualRegisters(
  preview: FullBudgetImportPreview,
  accounts: SidebarAccount[],
  maps: ActualImportMaps,
): Record<string, AccountRegisterView> {
  const registers: Record<string, AccountRegisterView> = {};
  for (const account of accounts) {
    registers[account.id] = createEmptyRegister(account, readPreviewCurrency(preview));
  }

  for (const [index, transaction] of preview.transactions.entries()) {
    const accountId = transaction.accountId ? maps.accountIdBySourceId.get(transaction.accountId) : null;
    if (!accountId || !registers[accountId]) continue;
    registers[accountId].transactions.push(mapActualRegisterTransaction(transaction, index, maps));
  }


  for (const register of Object.values(registers)) {
    recalculateRegister(register);
  }

  return registers;
}

function createEmptyRegister(account: SidebarAccount, currencyCode: string): AccountRegisterView {
  return {
    accountId: account.id,
    accountName: account.name,
    accountType: account.type === "credit-card" ? "Credit card" : account.type === "tracking" ? "Tracking" : "On budget",
    currencyCode,
    clearedBalance: 0,
    unclearedBalance: 0,
    workingBalance: 0,
    transactions: [],
  };
}

function mapActualRegisterTransaction(
  transaction: FullBudgetImportPreview["transactions"][number],
  index: number,
  maps: ActualImportMaps,
): RegisterTransactionView {
  const amount = minorUnitsToDisplayAmount(transaction.amount);
  const categoryId = transaction.categoryId ? maps.categoryIdBySourceId.get(transaction.categoryId) : undefined;
  const payeeId = transaction.payeeId ? maps.payeeIdBySourceId.get(transaction.payeeId) : undefined;
  const transferAccountId = transaction.transferId ? maps.accountIdBySourceId.get(transaction.transferId) : undefined;
  const payee = transferAccountId
    ? `Transfer: ${maps.accountNameById.get(transferAccountId) ?? "Account"}`
    : transaction.payeeName ?? (payeeId ? maps.payeeNameById.get(payeeId) : null) ?? "Imported Payee";

  const splitLines = mapActualSplitLines(transaction, maps);

  return {
    id: transaction.id || `actual-transaction-${index + 1}`,
    date: transaction.date ?? "1970-01-01",
    attachmentCount: 0,
    payee,
    payeeId: transferAccountId ? undefined : payeeId,
    category: splitLines.length > 0
      ? "Split"
      : categoryId
        ? maps.categoryNameById.get(categoryId) ?? "Uncategorised"
        : transferAccountId
          ? "Transfer"
          : READY_TO_ASSIGN_CATEGORY_NAME,
    categoryId: splitLines.length > 0 ? undefined : categoryId ?? READY_TO_ASSIGN_CATEGORY_ID,
    memo: transaction.memo ?? undefined,
    inflow: amount > 0 ? amount : 0,
    outflow: amount < 0 ? Math.abs(amount) : 0,
    runningBalance: 0,
    cleared: transaction.cleared === true,
    reconciled: false,
    transferAccountId,
    splitLines: splitLines.length > 0 ? splitLines : undefined,
  };
}

function mapActualSplitLines(
  transaction: FullBudgetImportPreview["transactions"][number],
  maps: ActualImportMaps,
): NonNullable<RegisterTransactionView["splitLines"]> {
  return (transaction.splitLines ?? []).map((line, index) => {
    const amount = minorUnitsToDisplayAmount(line.amount);
    const categoryId = line.categoryId ? maps.categoryIdBySourceId.get(line.categoryId) : undefined;
    return {
      id: line.id || `${transaction.id}-split-${index + 1}`,
      category: categoryId ? maps.categoryNameById.get(categoryId) ?? "Uncategorised" : READY_TO_ASSIGN_CATEGORY_NAME,
      categoryId: categoryId ?? READY_TO_ASSIGN_CATEGORY_ID,
      memo: line.memo ?? undefined,
      inflow: amount > 0 ? amount : 0,
      outflow: amount < 0 ? Math.abs(amount) : 0,
    };
  });
}

function minorUnitsToDisplayAmount(value: number | null): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.round(value) / 100;
}

function recalculateRegister(register: AccountRegisterView): void {
  const chronological = [...register.transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let runningBalance = 0;
  const runningBalanceById = new Map<string, number>();
  for (const transaction of chronological) {
    runningBalance += transaction.inflow - transaction.outflow;
    runningBalanceById.set(transaction.id, roundMoney(runningBalance));
  }
  register.transactions = register.transactions
    .map((transaction) => ({ ...transaction, runningBalance: runningBalanceById.get(transaction.id) ?? 0 }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  register.clearedBalance = roundMoney(register.transactions
    .filter((transaction) => transaction.cleared || transaction.reconciled)
    .reduce((sum, transaction) => sum + transaction.inflow - transaction.outflow, 0));
  register.workingBalance = roundMoney(register.transactions.reduce((sum, transaction) => sum + transaction.inflow - transaction.outflow, 0));
  register.unclearedBalance = roundMoney(register.workingBalance - register.clearedBalance);
}

function mapActualBudgetMonthViews(
  budget: BudgetSummary,
  templateGroups: BudgetCategoryGroupView[],
  registers: Record<string, AccountRegisterView>,
  preview: FullBudgetImportPreview,
  maps: ActualImportMaps,
  now: Date,
): Map<string, BudgetMonthView> {
  const months = new Set<string>([now.toISOString().slice(0, 7)]);
  for (const budgetMonth of preview.budgetMonths ?? []) {
    if (/^\d{4}-\d{2}$/.test(budgetMonth.month)) months.add(budgetMonth.month);
  }

  for (const register of Object.values(registers)) {
    for (const transaction of register.transactions) {
      months.add(transaction.date.slice(0, 7));
    }
  }

  const activityByMonthCategory = buildActualActivityByMonthCategoryFromRegisters(registers);
  const budgetDataByMonthCategory = buildActualBudgetDataByMonthCategory(preview, maps.categoryIdBySourceId);
  const views = new Map<string, BudgetMonthView>();

  const previousAvailableByCategory = new Map<string, number>();

  for (const month of [...months].sort()) {
    const groups = cloneCategoryGroups(templateGroups);
    const categoryById = new Map(groups.flatMap((group) => group.categories.map((category) => [category.id, category] as const)));
    const activityByCategory = activityByMonthCategory.get(month) ?? new Map<string, number>();
    const budgetDataByCategory = budgetDataByMonthCategory.get(month) ?? new Map<string, ActualBudgetCategoryMonthData>();

    for (const category of categoryById.values()) {
      const budgetData = budgetDataByCategory.get(category.id);
      const previousAvailable = roundMoney(previousAvailableByCategory.get(category.id) ?? 0);
      const shouldCarryForward = previousAvailable > 0 || Boolean(budgetData?.carryover);
      category.previousAvailable = shouldCarryForward ? previousAvailable : 0;
      category.assigned = roundMoney(budgetData?.assigned ?? 0);
      category.activity = roundMoney(activityByCategory.get(category.id) ?? 0);
      category.available = normaliseMoney(category.previousAvailable + category.assigned + category.activity);
      category.isOverspent = isMoneyNegative(category.available);
      previousAvailableByCategory.set(category.id, category.available);
    }

    for (const group of groups) {
      group.previousAvailable = roundMoney(group.categories.reduce((sum, category) => sum + category.previousAvailable, 0));
      group.assigned = roundMoney(group.categories.reduce((sum, category) => sum + category.assigned, 0));
      group.activity = roundMoney(group.categories.reduce((sum, category) => sum + category.activity, 0));
      group.available = normaliseMoney(group.categories.reduce((sum, category) => sum + category.available, 0));
    }

    const totalAssigned = groups.reduce((sum, group) => sum + group.assigned, 0);
    const totalActivity = roundMoney(groups.reduce((sum, group) => sum + group.activity, 0));
    const totalAvailable = normaliseMoney(groups.reduce((sum, group) => sum + group.available, 0));

    views.set(month, {
      budgetId: budget.id,
      budgetName: budget.name,
      monthLabel: monthLabelFromIsoMonth(month),
      currencyCode: budget.currency,
      readyToAssign: 0,
      totalAssigned,
      totalActivity,
      totalAvailable,
      categoryGroups: groups,
    });
  }

  return views;
}


interface ActualBudgetCategoryMonthData {
  assigned: number;
  carryover: boolean;
}

function buildActualBudgetDataByMonthCategory(
  preview: FullBudgetImportPreview,
  categoryIdBySourceId: Map<string, string>,
): Map<string, Map<string, ActualBudgetCategoryMonthData>> {
  const result = new Map<string, Map<string, ActualBudgetCategoryMonthData>>();

  for (const budgetMonth of preview.budgetMonths ?? []) {
    if (!budgetMonth.categoryId || typeof budgetMonth.assigned !== "number") continue;
    const categoryId = categoryIdBySourceId.get(budgetMonth.categoryId);
    if (!categoryId) continue;
    const byCategory = result.get(budgetMonth.month) ?? new Map<string, ActualBudgetCategoryMonthData>();
    const existing = byCategory.get(categoryId) ?? { assigned: 0, carryover: false };
    byCategory.set(categoryId, {
      assigned: roundMoney(existing.assigned + minorUnitsToDisplayAmount(budgetMonth.assigned)),
      carryover: existing.carryover || Boolean(budgetMonth.carryover),
    });
    result.set(budgetMonth.month, byCategory);
  }

  return result;
}

function buildActualActivityByMonthCategoryFromRegisters(
  registers: Record<string, AccountRegisterView>,
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();

  for (const register of Object.values(registers)) {
    for (const transaction of register.transactions) {
      if (!transaction.date || !/^\d{4}-\d{2}/.test(transaction.date)) continue;
      const month = transaction.date.slice(0, 7);
      const byCategory = result.get(month) ?? new Map<string, number>();

      if (transaction.splitLines?.length) {
        for (const splitLine of transaction.splitLines) {
          if (!splitLine.categoryId || splitLine.categoryId === READY_TO_ASSIGN_CATEGORY_ID) continue;
          const amount = splitLine.inflow - splitLine.outflow;
          byCategory.set(splitLine.categoryId, roundMoney((byCategory.get(splitLine.categoryId) ?? 0) + amount));
        }
        result.set(month, byCategory);
        continue;
      }

      if (!transaction.categoryId || transaction.categoryId === READY_TO_ASSIGN_CATEGORY_ID) continue;
      const amount = transaction.inflow - transaction.outflow;
      byCategory.set(transaction.categoryId, roundMoney((byCategory.get(transaction.categoryId) ?? 0) + amount));
      result.set(month, byCategory);
    }
  }

  return result;
}

function cloneCategoryGroups(groups: BudgetCategoryGroupView[]): BudgetCategoryGroupView[] {
  return groups.map((group) => ({
    ...group,
    categories: group.categories.map((category) => ({ ...category })),
  }));
}

interface ActualBudgetLauncherImportRollbackSnapshot {
  budgetId: string | null;
  keysBeforeImport: Set<string>;
  registryBeforeImport: string | null;
  selectedBudgetBeforeImport: string | null;
}

function rollbackActualBudgetLauncherImport(
  storage: KeyValueStoragePort,
  snapshot: ActualBudgetLauncherImportRollbackSnapshot,
): void {
  const keysAfterImport = storage.listKeys?.() ?? [];
  for (const key of keysAfterImport) {
    if (!snapshot.keysBeforeImport.has(key)) {
      storage.removeItem(key);
    }
  }

  if (snapshot.budgetId) {
    storage.removeItem(getActualBudgetLauncherImportStorageKey(snapshot.budgetId));
    storage.removeItem(getBudgetScopedStorageKey(snapshot.budgetId, ACCOUNTS_STORAGE_KEY));
    storage.removeItem(getBudgetScopedStorageKey(snapshot.budgetId, REGISTERS_STORAGE_KEY));
    storage.removeItem(getBudgetScopedStorageKey(snapshot.budgetId, PAYEES_STORAGE_KEY));
    storage.removeItem(getBudgetScopedStorageKey(snapshot.budgetId, SCHEDULED_STORAGE_KEY));

    for (const key of storage.listKeys?.() ?? []) {
      if (
        key.startsWith(`${BUDGET_VIEW_STORAGE_PREFIX}.${snapshot.budgetId}.`) ||
        key.startsWith(getBudgetScopedStorageKey(snapshot.budgetId, `${BUDGET_VIEW_STORAGE_PREFIX}.`))
      ) {
        storage.removeItem(key);
      }
    }
  }

  restoreStorageValue(storage, BUDGET_REGISTRY_STORAGE_KEY, snapshot.registryBeforeImport);
  restoreStorageValue(storage, SELECTED_BUDGET_STORAGE_KEY, snapshot.selectedBudgetBeforeImport);
}

function restoreStorageValue(storage: KeyValueStoragePort, key: string, value: string | null): void {
  if (value === null) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, value);
}

function isStorageQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown };
  return (
    candidate.name === "QuotaExceededError" ||
    candidate.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    candidate.code === 22 ||
    candidate.code === 1014 ||
    (typeof candidate.message === "string" && candidate.message.toLowerCase().includes("quota"))
  );
}

function uniqueSlug(name: string, existingIds: Set<string>, fallback: string): string {
  const base = slugify(name) || fallback;
  if (!existingIds.has(base)) {
    existingIds.add(base);
    return base;
  }
  let counter = 2;
  while (existingIds.has(`${base}-${counter}`)) counter += 1;
  const id = `${base}-${counter}`;
  existingIds.add(id);
  return id;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function monthLabelFromIsoMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return month;
  return new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
}
