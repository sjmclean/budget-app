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
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import type { SidebarAccount, SidebarAccountType } from "../accounts/accountService";
import type { AccountRegisterView, RegisterTransactionView } from "../accounts/accountRegisterTypes";
import type { PayeeView } from "../accounts/payeeService";
import type { ScheduledTransactionView, ScheduledFrequency } from "../accounts/scheduledTransactionService";
import type { BudgetMonthView, BudgetCategoryGroupView } from "./budgetViewTypes";
import {
  auditYnab4LauncherImportAccuracy,
  formatYnab4LauncherImportAccuracyAuditReport,
  type Ynab4LauncherImportAccuracyAuditResult,
} from "./ynab4LauncherImportAccuracyAudit";
import type {
  Ynab4PackageDiscoveryResult,
  Ynab4PackageEntry,
  Ynab4PackageMigrationPreview,
} from "../../../../../packages/ynab4-importer/src/analyzeYnab4Package";

export const YNAB4_LAUNCHER_IMPORT_STORAGE_PREFIX =
  "budget-app.ynab4-launcher-import.v1";

const ACCOUNTS_STORAGE_KEY = "budget-app.accounts.v1";
const REGISTERS_STORAGE_KEY = "budget-app.account-registers.v1";
const PAYEES_STORAGE_KEY = "budget-app.payees.v1";
const SCHEDULED_STORAGE_KEY = "budget-app.scheduled-transactions.v1";
const BUDGET_VIEW_STORAGE_PREFIX = "budget-app.budget-view.v1";
const READY_TO_ASSIGN_CATEGORY_ID = "__ready_to_assign__";
const READY_TO_ASSIGN_CATEGORY_NAME = "Ready to Assign";

export interface Ynab4LauncherImportRecord {
  budgetId: string;
  budgetName: string;
  sourceBudgetName: string | null;
  sourcePackageRoot: string | null;
  sourceDataPath: string | null;
  mode: "new-budget";
  status: "completed";
  importedAt: string;
  counts: {
    accounts: number;
    categoryGroups: number;
    categories: number;
    payees: number;
    monthlyBudgets: number;
    transactions: number;
    scheduledTransactions: number;
    categoryNotes: number;
    categoryGroupNotes: number;
  };
  warnings: string[];
  progressSteps: Array<{
    phase: string;
    label: string;
    detail?: string;
  }>;
  accuracyAudit?: Ynab4LauncherImportAccuracyAuditResult;
  accuracyAuditReport?: string;
}

export interface CreateYnab4LauncherBudgetImportInput {
  discovery: Ynab4PackageDiscoveryResult;
  preview: Ynab4PackageMigrationPreview;
  entries: Ynab4PackageEntry[];
  now?: Date;
}

export interface Ynab4LauncherImportResult {
  budget: BudgetSummary;
  record: Ynab4LauncherImportRecord;
  budgets: BudgetSummary[];
}

type Ynab4ImportData = Record<string, unknown>;
type RecordMap = Record<string, unknown>;

type ImportMaps = {
  accountIdBySourceId: Map<string, string>;
  accountNameById: Map<string, string>;
  categoryIdBySourceId: Map<string, string>;
  categoryNameById: Map<string, string>;
  payeeIdBySourceId: Map<string, string>;
  payeeNameById: Map<string, string>;
};

export function getYnab4LauncherImportStorageKey(budgetId: string): string {
  return `${YNAB4_LAUNCHER_IMPORT_STORAGE_PREFIX}.${budgetId}`;
}

export function readYnab4LauncherImportRecord(
  storage: KeyValueStoragePort,
  budgetId: string,
): Ynab4LauncherImportRecord | null {
  const raw = storage.getItem(getYnab4LauncherImportStorageKey(budgetId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Ynab4LauncherImportRecord;
    return parsed && parsed.budgetId === budgetId ? parsed : null;
  } catch {
    return null;
  }
}

export function createYnab4LauncherBudgetImport(
  storage: KeyValueStoragePort,
  input: CreateYnab4LauncherBudgetImportInput,
): Ynab4LauncherImportResult {
  if (!input.discovery.isYnab4Package || !input.preview.canContinue) {
    throw new Error("Cannot import YNAB4 package from launcher until preview validation passes.");
  }

  if (input.preview.mode !== "new-budget") {
    throw new Error("Launcher YNAB4 imports must create a new budget.");
  }

  const activeData = readActiveYnab4BudgetData(input.entries);
  if (!activeData) {
    throw new Error("Cannot import YNAB4 package because the active Budget.yfull data could not be read.");
  }

  const registryBeforeImport = storage.getItem(BUDGET_REGISTRY_STORAGE_KEY);
  const selectedBudgetBeforeImport = storage.getItem(SELECTED_BUDGET_STORAGE_KEY);
  const keysBeforeImport = new Set(storage.listKeys?.() ?? []);

  const now = input.now ?? new Date();
  let budget: BudgetSummary | null = null;

  try {
    const budgetName = createImportedBudgetName(input.preview.budgetName);
    budget = createBudgetRegistryEntry(storage, {
      name: budgetName,
      currency: "AUD",
      packagePath: input.discovery.packageRoot
        ? `${input.discovery.packageRoot}.budget`
        : undefined,
      now,
    });

    const persistenceWarnings = writeImportedBudgetData(storage, budget, activeData, now);
    const accuracyAudit = auditYnab4LauncherImportAccuracy(storage, {
      entries: input.entries,
      budgetId: budget.id,
    });
    const accuracyAuditReport = formatYnab4LauncherImportAccuracyAuditReport(accuracyAudit);

    if (accuracyAudit.status !== "pass") {
      logYnab4LauncherImportDiagnosticReport(accuracyAuditReport, accuracyAudit.status);
      throw new Error(
        `YNAB4 import accuracy audit failed. The imported data did not match the source package; no budget was saved.\n\n${accuracyAuditReport}`,
      );
    }

    markBudgetOpened(storage, budget.id, now);
    storage.setItem(SELECTED_BUDGET_STORAGE_KEY, budget.id);

    const record: Ynab4LauncherImportRecord = {
      budgetId: budget.id,
      budgetName: budget.name,
      sourceBudgetName: input.preview.budgetName,
      sourcePackageRoot: input.discovery.packageRoot,
      sourceDataPath: input.discovery.budgetDataPath,
      mode: "new-budget",
      status: "completed",
      importedAt: now.toISOString(),
      counts: {
        accounts: input.discovery.counts.accounts,
        categoryGroups: input.discovery.counts.masterCategories,
        categories: input.discovery.counts.categories,
        payees: input.discovery.counts.payees,
        monthlyBudgets: input.discovery.counts.monthlyBudgets,
        transactions: input.discovery.counts.transactions,
        scheduledTransactions: input.discovery.counts.scheduledTransactions,
        categoryNotes: input.discovery.counts.categoryNotes,
        categoryGroupNotes: input.discovery.counts.categoryGroupNotes,
      },
      warnings: [...input.preview.warnings, ...persistenceWarnings],
      progressSteps: input.preview.progressSteps.map((step) => ({
        phase: step.phase,
        label: step.label,
        detail: step.detail,
      })),
      accuracyAudit,
      accuracyAuditReport,
    };

    logYnab4LauncherImportDiagnosticReport(accuracyAuditReport, accuracyAudit.status);

    storage.setItem(
      getYnab4LauncherImportStorageKey(budget.id),
      JSON.stringify(record),
    );

    const openedBudget = markBudgetOpened(storage, budget.id, now) ?? budget;

    return {
      budget: openedBudget,
      record,
      budgets: readBudgetRegistry(storage),
    };
  } catch (error) {
    rollbackYnab4LauncherImport(storage, {
      budgetId: budget?.id ?? null,
      keysBeforeImport,
      registryBeforeImport,
      selectedBudgetBeforeImport,
    });

    if (isStorageQuotaError(error)) {
      throw new Error(
        "YNAB4 import requires more browser storage than localStorage allows. No budget was created and no partial data was saved. Use the future IndexedDB/SQLite-backed storage mode for full YNAB4 imports.",
        { cause: error },
      );
    }

    throw error;
  }
}

interface Ynab4LauncherImportRollbackSnapshot {
  budgetId: string | null;
  keysBeforeImport: Set<string>;
  registryBeforeImport: string | null;
  selectedBudgetBeforeImport: string | null;
}

function rollbackYnab4LauncherImport(
  storage: KeyValueStoragePort,
  snapshot: Ynab4LauncherImportRollbackSnapshot,
): void {
  const keysAfterImport = storage.listKeys?.() ?? [];
  for (const key of keysAfterImport) {
    if (!snapshot.keysBeforeImport.has(key)) {
      storage.removeItem(key);
    }
  }

  if (snapshot.budgetId) {
    storage.removeItem(getYnab4LauncherImportStorageKey(snapshot.budgetId));
    storage.removeItem(getBudgetScopedStorageKey(snapshot.budgetId, ACCOUNTS_STORAGE_KEY));
    storage.removeItem(getBudgetScopedStorageKey(snapshot.budgetId, REGISTERS_STORAGE_KEY));
    storage.removeItem(getBudgetScopedStorageKey(snapshot.budgetId, PAYEES_STORAGE_KEY));
    storage.removeItem(getBudgetScopedStorageKey(snapshot.budgetId, SCHEDULED_STORAGE_KEY));

    for (const key of storage.listKeys?.() ?? []) {
      if (key.startsWith(`${BUDGET_VIEW_STORAGE_PREFIX}.${snapshot.budgetId}.`)) {
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

function logYnab4LauncherImportDiagnosticReport(report: string, status: "pass" | "fail"): void {
  const logger = status === "pass" ? console.info : console.warn;
  logger(report);
}

export function createImportedBudgetName(sourceName: string | null): string {
  const baseName = sourceName?.trim() || "YNAB4 Budget";
  return `${baseName} Imported`;
}

function writeImportedBudgetData(
  storage: KeyValueStoragePort,
  budget: BudgetSummary,
  data: Ynab4ImportData,
  now: Date,
): string[] {
  const nowIso = now.toISOString();
  const maps: ImportMaps = {
    accountIdBySourceId: new Map(),
    accountNameById: new Map(),
    categoryIdBySourceId: new Map(),
    categoryNameById: new Map(),
    payeeIdBySourceId: new Map(),
    payeeNameById: new Map(),
  };

  const accounts = mapAccounts(toRecords(data.accounts), maps, nowIso);
  const categoryGroups = mapCategoryGroups(toRecords(data.masterCategories), maps);
  const payees = mapPayees(toRecords(data.payees), maps, nowIso);
  const registers = mapRegisters(toRecords(data.transactions), accounts, maps);
  const scheduled = mapScheduledTransactions(toRecords(data.scheduledTransactions), maps, nowIso);
  const monthViews = mapBudgetMonthViews(budget, toRecords(data.monthlyBudgets), categoryGroups, maps, now);

  writeScopedJson(storage, budget.id, ACCOUNTS_STORAGE_KEY, accounts);
  writeScopedJson(storage, budget.id, PAYEES_STORAGE_KEY, payees);
  writeScopedJson(storage, budget.id, REGISTERS_STORAGE_KEY, registers);
  writeScopedJson(storage, budget.id, SCHEDULED_STORAGE_KEY, scheduled);

  for (const [month, view] of monthViews) {
    storage.setItem(`${BUDGET_VIEW_STORAGE_PREFIX}.${budget.id}.${month}`, JSON.stringify(view));
  }

  return [];
}

function writeScopedJson(storage: KeyValueStoragePort, budgetId: string, key: string, value: unknown): void {
  storage.setItem(getBudgetScopedStorageKey(budgetId, key), JSON.stringify(value));
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

function mapAccounts(accounts: RecordMap[], maps: ImportMaps, nowIso: string): SidebarAccount[] {
  const existingIds = new Set<string>();
  return accounts.map((account, index) => {
    const name = firstString(account.name, account.accountName, account.displayName) ?? `Imported Account ${index + 1}`;
    const id = uniqueSlug(name, existingIds, "account");
    for (const sourceId of sourceIds(account, `account:${index}`)) {
      maps.accountIdBySourceId.set(sourceId, id);
    }
    maps.accountNameById.set(id, name);
    return {
      id,
      name,
      type: mapAccountType(firstString(account.accountType, account.type), account.onBudget),
      startingBalance: amountToDisplayUnits(account.startingBalance, account.balance, account.clearedBalance) ?? 0,
      createdAt: nowIso,
      closedAt: account.isTombstone === true || account.closed === true ? nowIso : null,
    };
  });
}

function mapCategoryGroups(groups: RecordMap[], maps: ImportMaps): BudgetCategoryGroupView[] {
  const existingGroupIds = new Set<string>();
  const existingCategoryIds = new Set<string>();

  return groups.map((group, groupIndex) => {
    const groupName = firstString(group.name, group.masterCategoryName, group.displayName) ?? `Imported Group ${groupIndex + 1}`;
    const groupId = uniqueSlug(groupName, existingGroupIds, "group");
    const categories = toRecords(group.subCategories).map((category, categoryIndex) => {
      const name = firstString(category.name, category.categoryName, category.displayName) ?? `Imported Category ${categoryIndex + 1}`;
      const id = uniqueSlug(name, existingCategoryIds, "category");
      for (const sourceId of sourceIds(category, `category:${groupIndex}:${categoryIndex}`)) {
        maps.categoryIdBySourceId.set(sourceId, id);
      }
      maps.categoryNameById.set(id, name);
      return {
        id,
        name,
        assigned: 0,
        activity: 0,
        available: 0,
        isOverspent: false,
        isArchived: category.isTombstone === true || category.hidden === true,
        note: firstString(category.note, category.notes) ?? "",
      };
    });

    return {
      id: groupId,
      name: groupName,
      assigned: 0,
      activity: 0,
      available: 0,
      note: firstString(group.note, group.notes) ?? "",
      categories,
    };
  });
}

function mapPayees(payees: RecordMap[], maps: ImportMaps, nowIso: string): PayeeView[] {
  const existingIds = new Set<string>();
  return payees.flatMap((payee, index) => {
    const name = firstString(payee.name, payee.payeeName, payee.displayName) ?? `Imported Payee ${index + 1}`;
    if (isTransferPayee(payee, name)) {
      return [];
    }
    const id = uniqueSlug(name, existingIds, "payee");
    for (const sourceId of sourceIds(payee, `payee:${index}`)) {
      maps.payeeIdBySourceId.set(sourceId, id);
    }
    maps.payeeNameById.set(id, name);
    return [{
      id,
      name,
      createdAt: nowIso,
      lastUsedAt: nowIso,
      useCount: 1,
      isArchived: payee.isTombstone === true || payee.hidden === true,
    }];
  });
}

function mapRegisters(
  transactions: RecordMap[],
  accounts: SidebarAccount[],
  maps: ImportMaps,
): Record<string, AccountRegisterView> {
  const registers: Record<string, AccountRegisterView> = {};
  for (const account of accounts) {
    registers[account.id] = createEmptyRegister(account);
  }

  for (const [index, transaction] of transactions.entries()) {
    if (transaction.isTombstone === true || transaction.deleted === true) continue;
    const accountId = mappedId(maps.accountIdBySourceId, transaction.accountId, transaction.accountEntityId);
    if (!accountId || !registers[accountId]) continue;
    registers[accountId].transactions.push(mapRegisterTransaction(transaction, index, maps));
  }

  for (const register of Object.values(registers)) {
    recalculateRegister(register);
  }

  return registers;
}

function createEmptyRegister(account: SidebarAccount): AccountRegisterView {
  return {
    accountId: account.id,
    accountName: account.name,
    accountType: account.type === "credit-card" ? "Credit card" : account.type === "tracking" ? "Tracking" : "On budget",
    currencyCode: "AUD",
    clearedBalance: 0,
    unclearedBalance: 0,
    workingBalance: 0,
    transactions: [],
  };
}

function mapRegisterTransaction(transaction: RecordMap, index: number, maps: ImportMaps): RegisterTransactionView {
  const amount = amountToDisplayUnits(transaction.amount, transaction.amountMilliUnits, transaction.inflow, transaction.outflow) ?? 0;
  const transferAccountId = mappedId(maps.accountIdBySourceId, transaction.targetAccountId, transaction.transferAccountId);
  const payeeId = mappedId(maps.payeeIdBySourceId, transaction.payeeId);
  const categoryId = transferAccountId ? undefined : mappedId(maps.categoryIdBySourceId, transaction.categoryId, transaction.subCategoryId);
  const payeeName = transferAccountId
    ? `Transfer: ${maps.accountNameById.get(transferAccountId) ?? "Account"}`
    : firstString(transaction.payeeName, transaction.payee) ?? (payeeId ? maps.payeeNameById.get(payeeId) : null) ?? "Imported Payee";

  return {
    id: firstString(transaction.entityId, transaction.id, transaction.transactionId) ?? `imported-transaction-${index}`,
    date: normaliseDate(firstString(transaction.date, transaction.dateString, transaction.acceptedDate)) ?? "1970-01-01",
    flag: mapFlag(firstString(transaction.flag, transaction.flagColor)),
    attachmentCount: 0,
    attachments: [],
    payee: payeeName,
    payeeId: transferAccountId ? undefined : payeeId ?? undefined,
    category: transferAccountId ? "Transfer" : categoryId ? maps.categoryNameById.get(categoryId) ?? "Uncategorised" : READY_TO_ASSIGN_CATEGORY_NAME,
    categoryId: transferAccountId ? undefined : categoryId ?? READY_TO_ASSIGN_CATEGORY_ID,
    memo: firstString(transaction.memo, transaction.note, transaction.notes) ?? undefined,
    checkNumber: firstString(transaction.checkNumber, transaction.check, transaction.number) ?? undefined,
    inflow: amount > 0 ? amount : 0,
    outflow: amount < 0 ? Math.abs(amount) : 0,
    runningBalance: 0,
    cleared: isCleared(transaction),
    reconciled: isReconciled(transaction),
    transferAccountId: transferAccountId ?? undefined,
    transferTransactionId: firstString(transaction.transferTransactionId) ?? undefined,
    splitLines: mapSplitLines(toRecords(transaction.subTransactions), maps),
  };
}

function mapSplitLines(lines: RecordMap[], maps: ImportMaps): RegisterTransactionView["splitLines"] {
  if (lines.length === 0) return undefined;
  return lines.map((line, index) => {
    const amount = amountToDisplayUnits(line.amount, line.amountMilliUnits, line.inflow, line.outflow) ?? 0;
    const categoryId = mappedId(maps.categoryIdBySourceId, line.categoryId, line.subCategoryId) ?? READY_TO_ASSIGN_CATEGORY_ID;
    return {
      id: firstString(line.entityId, line.id) ?? `split-${index}`,
      category: maps.categoryNameById.get(categoryId) ?? READY_TO_ASSIGN_CATEGORY_NAME,
      categoryId,
      memo: firstString(line.memo, line.note, line.notes) ?? undefined,
      inflow: amount > 0 ? amount : 0,
      outflow: amount < 0 ? Math.abs(amount) : 0,
    };
  });
}

function recalculateRegister(register: AccountRegisterView): void {
  const chronological = [...register.transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let runningBalance = 0;
  const runningBalanceById = new Map<string, number>();
  for (const transaction of chronological) {
    runningBalance += transaction.inflow - transaction.outflow;
    runningBalanceById.set(transaction.id, runningBalance);
  }
  register.transactions = register.transactions
    .map((transaction) => ({ ...transaction, runningBalance: runningBalanceById.get(transaction.id) ?? 0 }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  register.clearedBalance = register.transactions
    .filter((transaction) => transaction.cleared || transaction.reconciled)
    .reduce((sum, transaction) => sum + transaction.inflow - transaction.outflow, 0);
  register.workingBalance = register.transactions.reduce((sum, transaction) => sum + transaction.inflow - transaction.outflow, 0);
  register.unclearedBalance = register.workingBalance - register.clearedBalance;
}

function mapScheduledTransactions(transactions: RecordMap[], maps: ImportMaps, nowIso: string): ScheduledTransactionView[] {
  return transactions.flatMap((transaction, index) => {
    if (transaction.isTombstone === true || transaction.deleted === true) return [];
    const accountId = mappedId(maps.accountIdBySourceId, transaction.accountId, transaction.accountEntityId);
    if (!accountId) return [];
    const amount = amountToDisplayUnits(transaction.amount, transaction.amountMilliUnits, transaction.inflow, transaction.outflow) ?? 0;
    const transferAccountId = mappedId(maps.accountIdBySourceId, transaction.targetAccountId, transaction.transferAccountId);
    const payeeId = mappedId(maps.payeeIdBySourceId, transaction.payeeId);
    const categoryId = transferAccountId ? undefined : mappedId(maps.categoryIdBySourceId, transaction.categoryId, transaction.subCategoryId);
    return [{
      id: firstString(transaction.entityId, transaction.id, transaction.scheduledTransactionId) ?? `imported-scheduled-${index}`,
      accountId,
      flag: mapFlag(firstString(transaction.flag, transaction.flagColor)),
      nextDueDate: normaliseDate(firstString(transaction.nextDueDate, transaction.date, transaction.dateString)) ?? "1970-01-01",
      frequency: mapFrequency(firstString(transaction.frequency, transaction.repeat, transaction.recurrence)),
      payee: transferAccountId
        ? `Transfer: ${maps.accountNameById.get(transferAccountId) ?? "Account"}`
        : firstString(transaction.payeeName, transaction.payee) ?? (payeeId ? maps.payeeNameById.get(payeeId) : null) ?? "Imported Payee",
      payeeId: transferAccountId ? undefined : payeeId ?? undefined,
      category: transferAccountId ? "Transfer" : categoryId ? maps.categoryNameById.get(categoryId) ?? "Uncategorised" : READY_TO_ASSIGN_CATEGORY_NAME,
      memo: firstString(transaction.memo, transaction.note, transaction.notes) ?? undefined,
      outflow: amount < 0 ? Math.abs(amount) : 0,
      inflow: amount > 0 ? amount : 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    }];
  });
}

function mapBudgetMonthViews(
  budget: BudgetSummary,
  monthlyBudgets: RecordMap[],
  templateGroups: BudgetCategoryGroupView[],
  maps: ImportMaps,
  now: Date,
): Map<string, BudgetMonthView> {
  const views = new Map<string, BudgetMonthView>();
  const sourceMonths = monthlyBudgets.length > 0 ? monthlyBudgets : [{ month: now.toISOString().slice(0, 7), monthlySubCategoryBudgets: [] }];

  for (const monthlyBudget of sourceMonths) {
    const month = monthKey(firstString(monthlyBudget.month, monthlyBudget.date, monthlyBudget.monthName)) ?? now.toISOString().slice(0, 7);
    const groups = cloneCategoryGroups(templateGroups);
    const categoryById = new Map(groups.flatMap((group) => group.categories.map((category) => [category.id, category] as const)));

    for (const row of toRecords(monthlyBudget.monthlySubCategoryBudgets)) {
      const categoryId = mappedId(maps.categoryIdBySourceId, row.categoryId, row.subCategoryId);
      const category = categoryId ? categoryById.get(categoryId) : undefined;
      if (!category) continue;
      category.assigned = amountToDisplayUnits(row.budgeted, row.assigned) ?? 0;
      category.activity = amountToDisplayUnits(row.activity) ?? -Math.abs(amountToDisplayUnits(row.outflows) ?? 0);
      category.available = amountToDisplayUnits(row.balance, row.available) ?? category.assigned + category.activity;
      category.isOverspent = category.available < 0;
    }

    for (const group of groups) {
      group.assigned = group.categories.reduce((sum, category) => sum + category.assigned, 0);
      group.activity = group.categories.reduce((sum, category) => sum + category.activity, 0);
      group.available = group.categories.reduce((sum, category) => sum + category.available, 0);
    }

    const totalAssigned = groups.reduce((sum, group) => sum + group.assigned, 0);
    const totalActivity = groups.reduce((sum, group) => sum + group.activity, 0);
    const totalAvailable = groups.reduce((sum, group) => sum + group.available, 0);
    views.set(month, {
      budgetId: budget.id,
      budgetName: budget.name,
      monthLabel: monthLabelFromIsoMonth(month),
      currencyCode: budget.currency,
      readyToAssign: amountToDisplayUnits(monthlyBudget.availableToBudget, monthlyBudget.buffered, monthlyBudget.income) ?? 0,
      totalAssigned,
      totalActivity,
      totalAvailable,
      categoryGroups: groups,
    });
  }

  return views;
}

function cloneCategoryGroups(groups: BudgetCategoryGroupView[]): BudgetCategoryGroupView[] {
  return groups.map((group) => ({
    ...group,
    categories: group.categories.map((category) => ({ ...category })),
  }));
}

function readActiveYnab4BudgetData(entries: Ynab4PackageEntry[]): Ynab4ImportData | null {
  const normalisedEntries = entries.map((entry) => ({ path: normalisePath(entry.path), text: entry.text }));
  const metadataEntry = normalisedEntries.find((entry) => entry.path.endsWith("/Budget.ymeta") || entry.path === "Budget.ymeta");
  if (!metadataEntry) return null;

  let metadata: RecordMap;
  try {
    metadata = JSON.parse(metadataEntry.text) as RecordMap;
  } catch {
    return null;
  }

  const relativeDataFolderName = firstString(metadata.relativeDataFolderName);
  if (!relativeDataFolderName) return null;

  const packageRoot = inferPackageRoot(metadataEntry.path);
  const activeDataFolderPath = packageRoot ? `${packageRoot}/${relativeDataFolderName}` : relativeDataFolderName;
  const activePrefix = `${activeDataFolderPath}/`;
  const budgetDataEntry = normalisedEntries
    .filter((entry) => entry.path.startsWith(activePrefix))
    .find((entry) => entry.path.endsWith("/Budget.yfull") || entry.path.endsWith("/Budget.json"));

  if (!budgetDataEntry) return null;

  try {
    const parsed = JSON.parse(budgetDataEntry.text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function amountToDisplayUnits(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Number.isInteger(value) ? value / 1000 : Math.round(value * 100) / 100;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(/[$,]/g, ""));
      if (Number.isFinite(parsed)) return Number.isInteger(parsed) ? parsed / 1000 : Math.round(parsed * 100) / 100;
    }
  }
  return null;
}

function mapAccountType(value: string | null, onBudget: unknown): SidebarAccountType {
  if (onBudget === false) return "tracking";
  const normalized = (value ?? "").replace(/[\s_-]/g, "").toLowerCase();
  if (["creditcard", "credit", "card"].includes(normalized)) return "credit-card";
  if (["investment", "brokerage", "asset", "liability", "loan", "mortgage"].includes(normalized)) return "tracking";
  return "on-budget";
}

function mapFlag(value: string | null): RegisterTransactionView["flag"] {
  const normalized = value?.trim().toLowerCase();
  if (["red", "orange", "yellow", "green", "blue", "purple"].includes(normalized ?? "")) {
    return normalized as RegisterTransactionView["flag"];
  }
  return null;
}

function mapFrequency(value: string | null): ScheduledFrequency {
  const normalized = value?.replace(/[\s_-]/g, "").toLowerCase();
  if (normalized === "weekly") return "weekly";
  if (normalized === "fortnightly" || normalized === "everyotherweek") return "fortnightly";
  if (normalized === "yearly" || normalized === "annually") return "yearly";
  if (normalized === "once" || normalized === "never") return "once";
  return "monthly";
}

function isCleared(row: RecordMap): boolean {
  const value = firstString(row.cleared, row.clearedStatus, row.accepted)?.toLowerCase();
  return value === "cleared" || value === "reconciled" || value === "accepted" || row.cleared === true || row.accepted === true;
}

function isReconciled(row: RecordMap): boolean {
  return firstString(row.cleared, row.clearedStatus)?.toLowerCase() === "reconciled";
}

function isTransferPayee(payee: RecordMap, name: string): boolean {
  return Boolean(firstString(payee.targetAccountId, payee.transferAccountId)) || name.toLowerCase().startsWith("transfer:");
}

function mappedId(map: Map<string, string>, ...values: unknown[]): string | null {
  for (const value of values) {
    const key = firstString(value);
    if (key && map.has(key)) return map.get(key)!;
  }
  return null;
}

function sourceIds(record: RecordMap, fallback: string): string[] {
  const ids = [
    firstString(record.entityId),
    firstString(record.id),
    firstString(record.accountId),
    firstString(record.categoryId),
    firstString(record.masterCategoryId),
    firstString(record.payeeId),
  ].filter((value): value is string => Boolean(value));
  return ids.length > 0 ? ids : [fallback];
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

function monthKey(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelFromIsoMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return month;
  return new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
}

function normaliseDate(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function toRecords(value: unknown): RecordMap[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is RecordMap {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalisePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

function inferPackageRoot(path: string): string | null {
  const parts = normalisePath(path).split("/");
  return parts.length > 1 ? parts[0] || null : null;
}
