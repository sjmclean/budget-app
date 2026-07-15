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
import type { CreditCardBehaviour } from "./budgetPreferences";
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
import { isMoneyNegative, normaliseMoney } from "./moneyMath";
import { getCurrentBudgetMonth } from "./budgetMonthNavigation";
import { TRANSACTION_TAGS_STORAGE_KEY } from "../tags/transactionTagPersistence";
import type {
  TransactionTagColour,
  TransactionTagDefinition,
} from "../tags/transactionTagTypes";

export const YNAB4_LAUNCHER_IMPORT_STORAGE_PREFIX =
  "budget-app.ynab4-launcher-import.v1";

const ACCOUNTS_STORAGE_KEY = "budget-app.accounts.v1";
const REGISTERS_STORAGE_KEY = "budget-app.account-registers.v1";
const PAYEES_STORAGE_KEY = "budget-app.payees.v1";
const SCHEDULED_STORAGE_KEY = "budget-app.scheduled-transactions.v1";
const BUDGET_VIEW_STORAGE_PREFIX = "budget-app.budget-view.v1";
const READY_TO_ASSIGN_CATEGORY_ID = "__ready_to_assign__";
const READY_TO_ASSIGN_CATEGORY_NAME = "Ready to Assign";
const YNAB4_SPLIT_CATEGORY_ID = "Category/__Split__";
const YNAB4_IMMEDIATE_INCOME_CATEGORY_ID = "Category/__ImmediateIncome__";
const YNAB4_DEFERRED_INCOME_CATEGORY_ID = "Category/__DeferredIncome__";

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
  creditCardBehaviour?: CreditCardBehaviour;
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
  accountTypeById: Map<string, SidebarAccountType>;
  categoryIdBySourceId: Map<string, string>;
  categoryNameById: Map<string, string>;
  categoryIsArchivedById: Map<string, boolean>;
  payeeIdBySourceId: Map<string, string>;
  payeeNameById: Map<string, string>;
};

export function getYnab4LauncherImportStorageKey(budgetId: string): string {
  return `${YNAB4_LAUNCHER_IMPORT_STORAGE_PREFIX}.${budgetId}`;
}

export async function createYnab4LauncherBudgetImportWithBackend(
  storage: KeyValueStoragePort,
  input: CreateYnab4LauncherBudgetImportInput,
): Promise<Ynab4LauncherImportResult> {
  const registryBeforeImport = storage.getItem(BUDGET_REGISTRY_STORAGE_KEY);
  const selectedBudgetBeforeImport = storage.getItem(SELECTED_BUDGET_STORAGE_KEY);
  const keysBeforeImport = new Set(storage.listKeys?.() ?? []);
  let result: Ynab4LauncherImportResult | null = null;

  try {
    result = createYnab4LauncherBudgetImport(storage, input);
    await storage.flush?.();
    return result;
  } catch (error) {
    rollbackYnab4LauncherImport(storage, {
      budgetId: result?.budget.id ?? null,
      keysBeforeImport,
      registryBeforeImport,
      selectedBudgetBeforeImport,
    });
    await storage.flush?.();
    throw error;
  }
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

  validateYnab4TransferIntegrity(activeData);

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
      preferences: input.creditCardBehaviour
        ? { creditCardBehaviour: input.creditCardBehaviour }
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
        "YNAB4 import requires more browser storage than localStorage allows. No budget was created and no partial data was saved. The IndexedDB-backed storage backend could not persist the full import. No budget was created and no partial data was saved.",
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

function validateYnab4TransferIntegrity(data: Ynab4ImportData): void {
  const transactions = toRecords(data.transactions).filter((transaction) => !isYnab4Tombstone(transaction));
  const transactionById = new Map<string, RecordMap>();

  for (const transaction of transactions) {
    const transactionId = firstString(transaction.entityId, transaction.id, transaction.transactionId);
    if (transactionId) transactionById.set(transactionId, transaction);
  }

  const errors: string[] = [];
  for (const transaction of transactions) {
    const transactionId = firstString(transaction.entityId, transaction.id, transaction.transactionId);
    const pairedTransactionId = firstString(transaction.transferTransactionId);
    if (!transactionId || !pairedTransactionId) continue;

    const pair = transactionById.get(pairedTransactionId);
    if (!pair) {
      errors.push(`${transactionId}: transfer pair ${pairedTransactionId} was not found.`);
      continue;
    }

    const reciprocalId = firstString(pair.transferTransactionId);
    if (reciprocalId !== transactionId) {
      errors.push(`${transactionId}: transfer pair ${pairedTransactionId} does not link back reciprocally.`);
    }

    const sourceAccountId = firstString(transaction.accountId, transaction.accountEntityId);
    const targetAccountId = firstString(transaction.targetAccountId, transaction.transferAccountId);
    const pairAccountId = firstString(pair.accountId, pair.accountEntityId);
    const pairTargetAccountId = firstString(pair.targetAccountId, pair.transferAccountId);
    if (!sourceAccountId || !targetAccountId || !pairAccountId || !pairTargetAccountId) {
      errors.push(`${transactionId}: transfer account relationship is incomplete.`);
    } else {
      if (sourceAccountId === targetAccountId) {
        errors.push(`${transactionId}: transfer source and target accounts must differ.`);
      }
      if (targetAccountId !== pairAccountId || pairTargetAccountId !== sourceAccountId) {
        errors.push(`${transactionId}: transfer account relationship does not match its pair.`);
      }
    }

    const amount = transactionAmountToDisplayUnits(
      transaction.amount,
      transaction.amountMilliUnits,
      transaction.inflow,
      transaction.outflow,
    );
    const pairAmount = transactionAmountToDisplayUnits(
      pair.amount,
      pair.amountMilliUnits,
      pair.inflow,
      pair.outflow,
    );
    if (amount === null || pairAmount === null || roundMoney(amount + pairAmount) !== 0) {
      errors.push(`${transactionId}: transfer amounts are not equal and opposite.`);
    }

    const date = normaliseDate(firstString(transaction.date, transaction.dateString, transaction.acceptedDate));
    const pairDate = normaliseDate(firstString(pair.date, pair.dateString, pair.acceptedDate));
    if (date && pairDate && date !== pairDate) {
      errors.push(`${transactionId}: transfer pair dates do not match.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`YNAB4 transfer integrity validation failed:\n- ${errors.join("\n- ")}`);
  }
}

function createImportedTransferId(
  transactionId: string | null,
  pairedTransactionId: string | null,
): string | undefined {
  if (!transactionId || !pairedTransactionId) return undefined;
  return `ynab4-transfer-${[transactionId, pairedTransactionId].sort().join("--")}`;
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
    accountTypeById: new Map(),
    categoryIdBySourceId: new Map(),
    categoryNameById: new Map(),
    categoryIsArchivedById: new Map(),
    payeeIdBySourceId: new Map(),
    payeeNameById: new Map(),
  };

  const transactionRecords = toRecords(data.transactions);
  const scheduledTransactionRecords = toRecords(data.scheduledTransactions);
  const accounts = mapAccounts(toRecords(data.accounts), maps, nowIso);
  const categoryGroups = mapCategoryGroups(
    toRecords(data.masterCategories),
    maps,
  );
  const payees = mapPayees(toRecords(data.payees), maps, nowIso);
  const importedFlagTags = mapImportedFlagTags(
    [...transactionRecords, ...scheduledTransactionRecords],
    nowIso,
  );
  const registers = mapRegisters(
    transactionRecords,
    accounts,
    maps,
    importedFlagTags.tagIdByColour,
  );
  const scheduled = mapScheduledTransactions(
    scheduledTransactionRecords,
    maps,
    nowIso,
  );
  const monthViews = mapBudgetMonthViews(budget, toRecords(data.monthlyBudgets), categoryGroups, maps, registers, now);

  writeScopedJson(storage, budget.id, ACCOUNTS_STORAGE_KEY, accounts);
  writeScopedJson(storage, budget.id, PAYEES_STORAGE_KEY, payees);
  writeScopedJson(
    storage,
    budget.id,
    TRANSACTION_TAGS_STORAGE_KEY,
    importedFlagTags.tags,
  );
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
    for (const sourceId of accountSourceIds(account, `account:${index}`)) {
      maps.accountIdBySourceId.set(sourceId, id);
    }
    const type = mapAccountType(firstString(account.accountType, account.type), account.onBudget);
    maps.accountNameById.set(id, name);
    maps.accountTypeById.set(id, type);
    return {
      id,
      name,
      type,
      startingBalance: explicitYnab4OpeningBalance(account),
      createdAt: nowIso,
      closedAt: isYnab4ClosedAccount(account) ? nowIso : null,
    };
  });
}

function explicitYnab4OpeningBalance(account: RecordMap): number {
  return amountToDisplayUnits(
    account.startingBalance,
    account.openingBalance,
    account.initialBalance,
  ) ?? 0;
}

function isYnab4ClosedAccount(account: RecordMap): boolean {
  return (
    account.isTombstone === true ||
    account.closed === true ||
    account.hidden === true
  );
}

type CategoryGroupDraft = BudgetCategoryGroupView & {
  sourceIds: Set<string>;
};

function mapCategoryGroups(
  groups: RecordMap[],
  maps: ImportMaps,
): BudgetCategoryGroupView[] {
  const existingGroupIds = new Set<string>();
  const existingCategoryIds = new Set<string>();
  const drafts: CategoryGroupDraft[] = [];
  const orderedGroups = orderYnab4CategoryGroupsForDisplay(groups);

  for (const [groupIndex, group] of orderedGroups.entries()) {
    const groupName = firstString(group.name, group.masterCategoryName, group.displayName) ?? `Imported Group ${groupIndex + 1}`;
    const groupSourceIds = categoryGroupSourceIds(group, `categoryGroup:${groupIndex}`);
    const subCategories = orderYnab4SubCategoriesForDisplay(toRecords(group.subCategories));
    const groupIsArchived = isYnab4Tombstone(group);

    // Match Actual Budget's YNAB4 importer: deleted category groups are not
    // imported or used as category-identity fallbacks.
    if (groupIsArchived) {
      continue;
    }

    const groupId = uniqueSlug(groupName, existingGroupIds, "group");
    const draft: CategoryGroupDraft = {
      id: groupId,
      name: groupName,
      previousAvailable: 0,
      assigned: 0,
      activity: 0,
      available: 0,
      note: firstString(group.note, group.notes) ?? "",
      categories: [],
      sourceIds: new Set(groupSourceIds),
    };

    const isHiddenCategoriesGroup = isYnab4HiddenCategoriesGroup(group, groupName);

    for (const [categoryIndex, category] of subCategories.entries()) {
      const categorySourceIds = importedCategorySourceIds(category, `category:${groupIndex}:${categoryIndex}`);
      const categoryIsTombstone = isYnab4Tombstone(category);
      // Actual Budget deliberately drops tombstoned categories. Transactions
      // and budget rows resolve only through IDs mapped for live categories.
      if (categoryIsTombstone) {
        continue;
      }

      const sourceCategoryName = firstString(category.name, category.categoryName, category.displayName);
      const categoryName = isHiddenCategoriesGroup
        ? ynab4HiddenCategoryDisplayName(sourceCategoryName)
        : sourceCategoryName ?? `Imported Category ${categoryIndex + 1}`;
      addImportedCategoryToGroup({
        group: draft,
        category,
        categoryName,
        sourceIds: categorySourceIds,
        existingCategoryIds,
        maps,
        isArchived: isHiddenCategoriesGroup,
      });
    }

    drafts.push(draft);
  }

  return drafts
    .filter((group) => group.categories.length > 0)
    .map(({ sourceIds: _sourceIds, ...group }) => group);
}

function orderYnab4CategoryGroupsForDisplay(groups: RecordMap[]): RecordMap[] {
  const visibleGroups: RecordMap[] = [];
  const hiddenGroups: RecordMap[] = [];

  for (const group of groups) {
    const groupName = firstString(group.name, group.masterCategoryName, group.displayName) ?? "";
    if (isYnab4HiddenCategoriesGroup(group, groupName)) {
      hiddenGroups.push(group);
    } else {
      visibleGroups.push(group);
    }
  }

  return [
    ...sortYnab4RecordsBySortableIndex(visibleGroups),
    ...sortYnab4RecordsBySortableIndex(hiddenGroups),
  ];
}

function orderYnab4SubCategoriesForDisplay(categories: RecordMap[]): RecordMap[] {
  return sortYnab4RecordsBySortableIndex(categories);
}

function sortYnab4RecordsBySortableIndex(records: RecordMap[]): RecordMap[] {
  return records
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const leftIndex = ynab4SortableIndex(left.record);
      const rightIndex = ynab4SortableIndex(right.record);

      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      return left.index - right.index;
    })
    .map(({ record }) => record);
}

function ynab4SortableIndex(record: RecordMap): number {
  const value = record.sortableIndex;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.MAX_SAFE_INTEGER;
}

function addImportedCategoryToGroup(input: {
  group: CategoryGroupDraft;
  category: RecordMap;
  categoryName: string;
  sourceIds: string[];
  existingCategoryIds: Set<string>;
  maps: ImportMaps;
  isArchived: boolean;
}): void {
  const id = uniqueSlug(input.categoryName, input.existingCategoryIds, "category");
  for (const sourceId of input.sourceIds) {
    input.maps.categoryIdBySourceId.set(sourceId, id);
  }
  input.maps.categoryNameById.set(id, input.categoryName);
  input.maps.categoryIsArchivedById.set(id, input.isArchived);
  input.group.categories.push({
    id,
    name: input.categoryName,
    sourceCategoryId: input.sourceIds[0],
    previousAvailable: 0,
    assigned: 0,
    activity: 0,
    available: 0,
    isOverspent: false,
    isArchived: input.isArchived,
    note: firstString(input.category.note, input.category.notes) ?? "",
  });
}

function findOrCreateCategoryGroupDraft(input: {
  drafts: CategoryGroupDraft[];
  groupName: string;
  groupSourceId: string | null;
  existingGroupIds: Set<string>;
}): CategoryGroupDraft {
  const normalisedGroupName = normaliseCategoryStateName(input.groupName);
  const existing = input.drafts.find((group) =>
    (input.groupSourceId && group.sourceIds.has(input.groupSourceId)) ||
    normaliseCategoryStateName(group.name) === normalisedGroupName,
  );

  if (existing) {
    if (input.groupSourceId) existing.sourceIds.add(input.groupSourceId);
    return existing;
  }

  const group: CategoryGroupDraft = {
    id: uniqueSlug(input.groupName, input.existingGroupIds, "group"),
    name: input.groupName,
    previousAvailable: 0,
    assigned: 0,
    activity: 0,
    available: 0,
    note: "",
    categories: [],
    sourceIds: new Set(input.groupSourceId ? [input.groupSourceId] : []),
  };
  input.drafts.push(group);
  return group;
}

function isYnab4HiddenCategoriesGroup(group: RecordMap, groupName: string): boolean {
  return groupName.toLowerCase() === "hidden categories" ||
    firstString(group.entityId, group.id, group.masterCategoryId) === "MasterCategory/__Hidden__";
}

function isYnab4Tombstone(record: RecordMap): boolean {
  return record.isTombstone === true || record.deleted === true;
}

function ynab4HiddenCategoryDisplayName(name: string | null): string {
  if (!name) return "Imported Hidden Category";
  const parts = name.split("`").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return name;
  // YNAB4 appends the original master-category entity ID. Actual Budget
  // removes only that suffix and retains the group/category path as display
  // text; it never uses the suffix to redirect identity.
  return parts.slice(0, -1).join("/").trim();
}

function normaliseCategoryStateName(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

function mapPayees(payees: RecordMap[], maps: ImportMaps, nowIso: string): PayeeView[] {
  const existingIds = new Set<string>();
  return payees.flatMap((payee, index) => {
    const name = firstString(payee.name, payee.payeeName, payee.displayName) ?? `Imported Payee ${index + 1}`;
    if (isTransferPayee(payee, name)) {
      return [];
    }
    const id = uniqueSlug(name, existingIds, "payee");
    for (const sourceId of payeeSourceIds(payee, `payee:${index}`)) {
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
  importedFlagTagIdByColour: ReadonlyMap<TransactionTagColour, string>,
): Record<string, AccountRegisterView> {
  const registers: Record<string, AccountRegisterView> = {};
  for (const account of accounts) {
    registers[account.id] = createEmptyRegister(account);
  }

  for (const [index, transaction] of transactions.entries()) {
    if (transaction.isTombstone === true || transaction.deleted === true) continue;
    const accountId = mappedId(maps.accountIdBySourceId, transaction.accountId, transaction.accountEntityId);
    if (!accountId || !registers[accountId]) continue;
    registers[accountId].transactions.push(
      mapRegisterTransaction(
        transaction,
        index,
        maps,
        importedFlagTagIdByColour,
        maps.accountTypeById.get(accountId) ?? "on-budget",
      ),
    );
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

function mapRegisterTransaction(
  transaction: RecordMap,
  index: number,
  maps: ImportMaps,
  importedFlagTagIdByColour: ReadonlyMap<TransactionTagColour, string>,
  owningAccountType: SidebarAccountType,
): RegisterTransactionView {
  const amount = transactionAmountToDisplayUnits(transaction.amount, transaction.amountMilliUnits, transaction.inflow, transaction.outflow) ?? 0;
  const transferAccountId = mappedId(maps.accountIdBySourceId, transaction.targetAccountId, transaction.transferAccountId);
  const payeeId = mappedId(maps.payeeIdBySourceId, transaction.payeeId);
  const sourceCategoryKind = ynab4CategoryKind(transaction.categoryId, transaction.subCategoryId);
  const mappedCategoryId = mappedId(maps.categoryIdBySourceId, transaction.categoryId, transaction.subCategoryId);
  const categoryId = sourceCategoryKind === "income"
    ? READY_TO_ASSIGN_CATEGORY_ID
    : sourceCategoryKind === "split"
      ? null
      : mappedCategoryId;
  const isTrackingAccount = owningAccountType === "tracking";
  const splitLines = mapSplitLines(
    toRecords(transaction.subTransactions),
    maps,
    isTrackingAccount,
  );
  const hasSplitLines = Boolean(splitLines && splitLines.length > 0);
  const transferAccountType = transferAccountId ? maps.accountTypeById.get(transferAccountId) : undefined;
  const isCategorisedOffBudgetTransfer = Boolean(transferAccountId && categoryId && transferAccountType === "tracking");
  const importedFlagColour = normaliseImportedFlagColour(
    firstString(transaction.flag, transaction.flagColor),
  );
  const importedFlagTagId = importedFlagColour
    ? importedFlagTagIdByColour.get(importedFlagColour)
    : undefined;
  const payeeName = transferAccountId
    ? `Transfer: ${maps.accountNameById.get(transferAccountId) ?? "Account"}`
    : firstString(transaction.payeeName, transaction.payee) ?? (payeeId ? maps.payeeNameById.get(payeeId) : null) ?? "Imported Payee";

  return {
    id: firstString(transaction.entityId, transaction.id, transaction.transactionId) ?? `imported-transaction-${index}`,
    date: normaliseDate(firstString(transaction.date, transaction.dateString, transaction.acceptedDate)) ?? "1970-01-01",
    ...(importedFlagTagId ? { tagIds: [importedFlagTagId] } : {}),
    attachmentCount: 0,
    attachments: [],
    payee: payeeName,
    payeeId: transferAccountId ? undefined : payeeId ?? undefined,
    category: isTrackingAccount
      ? transferAccountId ? "Transfer" : "Uncategorised"
      : hasSplitLines
        ? "Split"
        : categoryId && (!transferAccountId || isCategorisedOffBudgetTransfer)
          ? maps.categoryNameById.get(categoryId) ?? READY_TO_ASSIGN_CATEGORY_NAME
          : transferAccountId ? "Transfer" : READY_TO_ASSIGN_CATEGORY_NAME,
    categoryId: isTrackingAccount
      ? undefined
      : hasSplitLines
        ? undefined
        : categoryId ?? (transferAccountId ? undefined : READY_TO_ASSIGN_CATEGORY_ID),
    memo: firstString(transaction.memo, transaction.note, transaction.notes) ?? undefined,
    checkNumber: firstString(transaction.checkNumber, transaction.check, transaction.number) ?? undefined,
    inflow: amount > 0 ? amount : 0,
    outflow: amount < 0 ? Math.abs(amount) : 0,
    runningBalance: 0,
    cleared: isCleared(transaction),
    reconciled: isReconciled(transaction),
    transferId: createImportedTransferId(
      firstString(transaction.entityId, transaction.id, transaction.transactionId),
      firstString(transaction.transferTransactionId),
    ),
    transferAccountId: transferAccountId ?? undefined,
    transferTransactionId: firstString(transaction.transferTransactionId) ?? undefined,
    splitLines,
  };
}

function mapSplitLines(
  lines: RecordMap[],
  maps: ImportMaps,
  suppressBudgetCategories = false,
): RegisterTransactionView["splitLines"] {
  const activeLines = lines.filter((line) => !isYnab4Tombstone(line));
  if (activeLines.length === 0) return undefined;
  return activeLines.map((line, index) => {
    const amount = transactionAmountToDisplayUnits(line.amount, line.amountMilliUnits, line.inflow, line.outflow) ?? 0;
    const sourceCategoryKind = ynab4CategoryKind(line.categoryId, line.subCategoryId);
    const categoryId = sourceCategoryKind === "income" || sourceCategoryKind === "split"
      ? READY_TO_ASSIGN_CATEGORY_ID
      : mappedId(maps.categoryIdBySourceId, line.categoryId, line.subCategoryId) ?? READY_TO_ASSIGN_CATEGORY_ID;
    return {
      id: firstString(line.entityId, line.id) ?? `split-${index}`,
      category: suppressBudgetCategories
        ? "Uncategorised"
        : maps.categoryNameById.get(categoryId) ?? READY_TO_ASSIGN_CATEGORY_NAME,
      categoryId: suppressBudgetCategories ? undefined : categoryId,
      memo: firstString(line.memo, line.note, line.notes) ?? undefined,
      inflow: amount > 0 ? amount : 0,
      outflow: amount < 0 ? Math.abs(amount) : 0,
    };
  });
}


function transactionAmountToDisplayUnits(
  amount: unknown,
  amountMilliUnits: unknown,
  ...fallbackValues: unknown[]
): number | null {
  const displayAmount = parseDisplayAmount(amount);
  if (displayAmount !== null) return displayAmount;

  const milliUnitAmount = parseMilliUnitAmount(amountMilliUnits);
  if (milliUnitAmount !== null) return milliUnitAmount;

  for (const value of fallbackValues) {
    const parsed = parseDisplayAmount(value);
    if (parsed !== null) return parsed;
  }

  return null;
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
    const owningAccountType = maps.accountTypeById.get(accountId) ?? "on-budget";
    const isTrackingAccount = owningAccountType === "tracking";
    const splitLines = mapScheduledSplitLines(
      toRecords(transaction.subTransactions),
      maps,
      isTrackingAccount,
    );
    const amount = scheduledAmountToDisplayUnits(transaction.amount, transaction.amountMilliUnits, transaction.inflow, transaction.outflow) ?? 0;
    const transferAccountId = mappedId(maps.accountIdBySourceId, transaction.targetAccountId, transaction.transferAccountId);
    const payeeId = mappedId(maps.payeeIdBySourceId, transaction.payeeId);
    const sourceCategoryKind = ynab4CategoryKind(transaction.categoryId, transaction.subCategoryId);
    const mappedCategoryId = mappedId(maps.categoryIdBySourceId, transaction.categoryId, transaction.subCategoryId);
    const categoryId = sourceCategoryKind === "income"
      ? READY_TO_ASSIGN_CATEGORY_ID
      : sourceCategoryKind === "split"
        ? null
        : mappedCategoryId;
    const importedFlagColour = normaliseImportedFlagColour(
      firstString(transaction.flag, transaction.flagColor),
    );
    return [{
      id: firstString(transaction.entityId, transaction.id, transaction.scheduledTransactionId) ?? `imported-scheduled-${index}`,
      accountId,
      ...(importedFlagColour
        ? { tagIds: [`ynab4-imported-flag-${importedFlagColour}`] }
        : {}),
      nextDueDate: normaliseDate(firstString(transaction.nextDueDate, transaction.date, transaction.dateString)) ?? "1970-01-01",
      frequency: mapFrequency(firstString(transaction.frequency, transaction.repeat, transaction.recurrence)),
      payee: transferAccountId
        ? `Transfer: ${maps.accountNameById.get(transferAccountId) ?? "Account"}`
        : firstString(transaction.payeeName, transaction.payee) ?? (payeeId ? maps.payeeNameById.get(payeeId) : null) ?? "Imported Payee",
      payeeId: transferAccountId ? undefined : payeeId ?? undefined,
      category: isTrackingAccount
        ? transferAccountId ? "Transfer" : "Uncategorised"
        : splitLines && splitLines.length > 0
          ? "Split"
          : transferAccountId
            ? "Transfer"
            : categoryId === READY_TO_ASSIGN_CATEGORY_ID
              ? READY_TO_ASSIGN_CATEGORY_NAME
              : categoryId
                ? maps.categoryNameById.get(categoryId) ?? "Uncategorised"
                : READY_TO_ASSIGN_CATEGORY_NAME,
      categoryId: isTrackingAccount
        ? undefined
        : splitLines && splitLines.length > 0
          ? undefined
          : transferAccountId
            ? undefined
            : categoryId ?? READY_TO_ASSIGN_CATEGORY_ID,
      memo: firstString(transaction.memo, transaction.note, transaction.notes) ?? undefined,
      outflow: amount < 0 ? Math.abs(amount) : 0,
      inflow: amount > 0 ? amount : 0,
      splitLines,
      createdAt: nowIso,
      updatedAt: nowIso,
    }];
  });
}

function mapScheduledSplitLines(
  lines: RecordMap[],
  maps: ImportMaps,
  suppressBudgetCategories = false,
): RegisterTransactionView["splitLines"] {
  const activeLines = lines.filter((line) => !isYnab4Tombstone(line));
  if (activeLines.length === 0) return undefined;
  return activeLines.map((line, index) => {
    const amount = scheduledAmountToDisplayUnits(line.amount, line.amountMilliUnits, line.inflow, line.outflow) ?? 0;
    const sourceCategoryKind = ynab4CategoryKind(line.categoryId, line.subCategoryId);
    const categoryId = sourceCategoryKind === "income" || sourceCategoryKind === "split"
      ? READY_TO_ASSIGN_CATEGORY_ID
      : mappedId(maps.categoryIdBySourceId, line.categoryId, line.subCategoryId) ?? READY_TO_ASSIGN_CATEGORY_ID;
    return {
      id: firstString(line.entityId, line.id) ?? `scheduled-split-${index}`,
      category: suppressBudgetCategories
        ? "Uncategorised"
        : maps.categoryNameById.get(categoryId) ?? READY_TO_ASSIGN_CATEGORY_NAME,
      categoryId: suppressBudgetCategories ? undefined : categoryId,
      memo: firstString(line.memo, line.note, line.notes) ?? undefined,
      inflow: amount > 0 ? amount : 0,
      outflow: amount < 0 ? Math.abs(amount) : 0,
    };
  });
}

function scheduledAmountToDisplayUnits(
  amount: unknown,
  amountMilliUnits: unknown,
  ...fallbackValues: unknown[]
): number | null {
  const displayAmount = parseDisplayAmount(amount);
  if (displayAmount !== null) return displayAmount;

  const milliUnitAmount = parseMilliUnitAmount(amountMilliUnits);
  if (milliUnitAmount !== null) return milliUnitAmount;

  for (const value of fallbackValues) {
    const parsed = parseDisplayAmount(value);
    if (parsed !== null) return parsed;
  }

  return null;
}

function mapBudgetMonthViews(
  budget: BudgetSummary,
  monthlyBudgets: RecordMap[],
  templateGroups: BudgetCategoryGroupView[],
  maps: ImportMaps,
  registers: Record<string, AccountRegisterView>,
  now: Date,
): Map<string, BudgetMonthView> {
  const views = new Map<string, BudgetMonthView>();
  const activityByMonthCategory = buildBudgetActivityByMonthCategory(registers);
  const sourceMonths = (monthlyBudgets.length > 0 ? monthlyBudgets : [{ month: getCurrentBudgetMonth(now), monthlySubCategoryBudgets: [] }])
    .map((monthlyBudget) => ({
      monthlyBudget,
      month: monthKey(firstString(monthlyBudget.month, monthlyBudget.date, monthlyBudget.monthName)) ?? getCurrentBudgetMonth(now),
    }))
    .sort((left, right) => left.month.localeCompare(right.month));
  const previousAvailableByCategoryId = new Map<string, number>();

  for (const { monthlyBudget, month } of sourceMonths) {
    const groups = cloneCategoryGroups(templateGroups);
    const categoryById = new Map(groups.flatMap((group) => group.categories.map((category) => [category.id, category] as const)));
    const carryoverByCategoryId = new Map<string, boolean>();

    for (const row of toRecords(monthlyBudget.monthlySubCategoryBudgets)) {
      if (isYnab4Tombstone(row)) continue;
      const categoryId = mappedId(maps.categoryIdBySourceId, row.categoryId, row.subCategoryId);
      const category = categoryId ? categoryById.get(categoryId) : undefined;
      if (!category || !categoryId) continue;
      category.assigned = amountToDisplayUnits(row.budgeted, row.assigned) ?? 0;
      carryoverByCategoryId.set(
        categoryId,
        ynab4OverspendingHandlingCarriesNegativeBalance(
          firstString(row.overspendingHandling),
        ),
      );
    }

    const activityByCategory = activityByMonthCategory.get(month) ?? new Map<string, number>();
    for (const category of categoryById.values()) {
      const previousAvailable = roundMoney(previousAvailableByCategoryId.get(category.id) ?? 0);
      const shouldCarryForward = previousAvailable > 0 || Boolean(carryoverByCategoryId.get(category.id));
      category.previousAvailable = shouldCarryForward ? previousAvailable : 0;
      category.activity = roundMoney(activityByCategory.get(category.id) ?? 0);
      category.available = normaliseMoney(roundMoney(category.previousAvailable + category.assigned + category.activity));
      category.isOverspent = isMoneyNegative(category.available);
      previousAvailableByCategoryId.set(category.id, category.available);
    }

    for (const group of groups) {
      group.previousAvailable = group.categories.reduce((sum, category) => sum + category.previousAvailable, 0);
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


function ynab4OverspendingHandlingCarriesNegativeBalance(
  value: string | null,
): boolean {
  return value?.replace(/[\s_-]/g, "").toLowerCase() === "confined";
}

function buildBudgetActivityByMonthCategory(
  registers: Record<string, AccountRegisterView>,
): Map<string, Map<string, number>> {
  const activityByMonthCategory = new Map<string, Map<string, number>>();

  for (const register of Object.values(registers)) {
    if (register.accountType === "Tracking") continue;
    for (const transaction of register.transactions) {
      const month = transaction.date.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) continue;

      if (transaction.splitLines && transaction.splitLines.length > 0) {
        for (const splitLine of transaction.splitLines) {
          if (splitLine.categoryId) {
            addBudgetActivity(
              activityByMonthCategory,
              month,
              splitLine.categoryId,
              splitLine.inflow - splitLine.outflow,
            );
          }
        }
        continue;
      }

      if (!transaction.categoryId) continue;
      addBudgetActivity(
        activityByMonthCategory,
        month,
        transaction.categoryId,
        transaction.inflow - transaction.outflow,
      );
    }
  }

  return activityByMonthCategory;
}


function addBudgetActivity(
  activityByMonthCategory: Map<string, Map<string, number>>,
  month: string,
  categoryId: string | undefined,
  amount: number,
): void {
  if (!categoryId || categoryId === READY_TO_ASSIGN_CATEGORY_ID) return;

  const byCategory = activityByMonthCategory.get(month) ?? new Map<string, number>();
  byCategory.set(categoryId, roundMoney((byCategory.get(categoryId) ?? 0) + amount));
  activityByMonthCategory.set(month, byCategory);
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
    const parsed = parseDisplayAmount(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function parseDisplayAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return roundMoney(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,]/g, ""));
    if (Number.isFinite(parsed)) return roundMoney(parsed);
  }
  return null;
}

function parseMilliUnitAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return roundMoney(value / 1000);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,]/g, ""));
    if (Number.isFinite(parsed)) return roundMoney(parsed / 1000);
  }
  return null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function mapAccountType(value: string | null, onBudget: unknown): SidebarAccountType {
  if (onBudget === false) return "tracking";
  const normalized = (value ?? "").replace(/[\s_-]/g, "").toLowerCase();
  if (["creditcard", "credit", "card"].includes(normalized)) return "credit-card";
  if (["investment", "brokerage", "asset", "liability", "loan", "mortgage"].includes(normalized)) return "tracking";
  return "on-budget";
}

const IMPORTED_FLAG_COLOURS: readonly TransactionTagColour[] = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
];

function normaliseImportedFlagColour(
  value: string | null,
): TransactionTagColour | null {
  const normalised = value?.trim().toLowerCase();
  return IMPORTED_FLAG_COLOURS.includes(normalised as TransactionTagColour)
    ? (normalised as TransactionTagColour)
    : null;
}

function mapImportedFlagTags(
  transactions: readonly RecordMap[],
  nowIso: string,
): {
  tags: TransactionTagDefinition[];
  tagIdByColour: ReadonlyMap<TransactionTagColour, string>;
} {
  const colours = new Set<TransactionTagColour>();

  for (const transaction of transactions) {
    if (transaction.isTombstone === true || transaction.deleted === true) {
      continue;
    }

    const colour = normaliseImportedFlagColour(
      firstString(transaction.flag, transaction.flagColor),
    );
    if (colour) {
      colours.add(colour);
    }
  }

  const tags = IMPORTED_FLAG_COLOURS.filter((colour) => colours.has(colour)).map(
    (colour): TransactionTagDefinition => ({
      id: `ynab4-imported-flag-${colour}`,
      name: `${colour[0].toUpperCase()}${colour.slice(1)} flag`,
      description: "Imported from a YNAB4 transaction flag.",
      colour,
      autoTagImportedTransactions: false,
      archived: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    }),
  );

  return {
    tags,
    tagIdByColour: new Map(tags.map((tag) => [tag.colour, tag.id])),
  };
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

type Ynab4CategoryKind = "split" | "income" | "ordinary";

function ynab4CategoryKind(...values: unknown[]): Ynab4CategoryKind {
  const sourceCategoryId = firstString(...values);
  if (sourceCategoryId === YNAB4_SPLIT_CATEGORY_ID) return "split";
  if (
    sourceCategoryId === YNAB4_IMMEDIATE_INCOME_CATEGORY_ID ||
    sourceCategoryId === YNAB4_DEFERRED_INCOME_CATEGORY_ID
  ) {
    return "income";
  }
  return "ordinary";
}

function mappedId(map: Map<string, string>, ...values: unknown[]): string | null {
  for (const value of values) {
    const key = firstString(value);
    if (key && map.has(key)) return map.get(key)!;
  }
  return null;
}

function accountSourceIds(record: RecordMap, fallback: string): string[] {
  return ownEntitySourceIds(record, fallback, record.accountId);
}

function categoryGroupSourceIds(record: RecordMap, fallback: string): string[] {
  return ownEntitySourceIds(record, fallback, record.masterCategoryId);
}

function importedCategorySourceIds(record: RecordMap, fallback: string): string[] {
  return ownEntitySourceIds(
    record,
    fallback,
    record.categoryId,
    record.subCategoryId,
  );
}

function payeeSourceIds(record: RecordMap, fallback: string): string[] {
  return ownEntitySourceIds(record, fallback, record.payeeId);
}

function ownEntitySourceIds(
  record: RecordMap,
  fallback: string,
  ...entitySpecificIds: unknown[]
): string[] {
  const ids = [
    firstString(record.entityId),
    firstString(record.id),
    ...entitySpecificIds.map((value) => firstString(value)),
  ].filter((value): value is string => Boolean(value));
  return [...new Set(ids.length > 0 ? ids : [fallback])];
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
