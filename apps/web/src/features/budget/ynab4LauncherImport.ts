import { createBudgetRegistryEntry, type BudgetSummary } from "./budgetRegistry";
import { getBudgetScopedStorageKey } from "./budgetDataScope";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import type { CreditCardBehaviour } from "./budgetPreferences";
import type { SidebarAccount, SidebarAccountType } from "../accounts/accountService";
import type { AccountRegisterView, RegisterTransactionView } from "../accounts/accountRegisterTypes";
import type { PayeeView } from "../accounts/payeeService";
import type { ScheduledTransactionView } from "../accounts/scheduledTransactionService";
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
import { readYnab4BudgetData } from "../../../../../packages/ynab4-importer/src/package/readBudget";
import {
  decodeYnabAmount,
  firstYnabDisplayAmount,
} from "../../../../../packages/ynab4-importer/src/money/decodeYnabAmount";
import { validateYnab4TransferIntegrity } from "../../../../../packages/ynab4-importer/src/transfers/validateYnab4TransferIntegrity";
import { mapYnab4Recurrence } from "../../../../../packages/ynab4-importer/src/scheduled/mapYnab4Recurrence";
import { mapYnab4BudgetMonths } from "./ynab4/mapYnab4BudgetMonths";
import {
  createImportedTransferId,
  mapYnab4Transactions,
  resolveYnab4CategoryId,
} from "./ynab4/mapYnab4Transactions";
import { validateYnab4SourceIdentities } from "./ynab4/validateYnab4SourceIdentities";
import {
  commitYnab4LauncherImport,
  getYnab4LauncherImportStorageKey,
  readYnab4LauncherImportRecord,
  type Ynab4LauncherImportRecord,
} from "./ynab4/finaliseYnab4Import";
import {
  captureYnab4LauncherImportRollbackSnapshot,
  rollbackYnab4LauncherImport,
} from "./ynab4/rollbackYnab4Import";
import {
  YNAB4_ACCOUNTS_STORAGE_KEY,
  YNAB4_BUDGET_VIEW_STORAGE_PREFIX,
  YNAB4_PAYEES_STORAGE_KEY,
  YNAB4_REGISTERS_STORAGE_KEY,
  YNAB4_SCHEDULED_STORAGE_KEY,
} from "./ynab4/importStorageKeys";
import { TRANSACTION_TAGS_STORAGE_KEY } from "../tags/transactionTagPersistence";
import type {
  TransactionTagColour,
  TransactionTagDefinition,
} from "../tags/transactionTagTypes";

export {
  getYnab4LauncherImportStorageKey,
  readYnab4LauncherImportRecord,
  type Ynab4LauncherImportRecord,
} from "./ynab4/finaliseYnab4Import";

const READY_TO_ASSIGN_CATEGORY_ID = "__ready_to_assign__";
const READY_TO_ASSIGN_CATEGORY_NAME = "Ready to Assign";
const YNAB4_SPLIT_CATEGORY_ID = "Category/__Split__";
const YNAB4_IMMEDIATE_INCOME_CATEGORY_ID = "Category/__ImmediateIncome__";
const YNAB4_DEFERRED_INCOME_CATEGORY_ID = "Category/__DeferredIncome__";

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
  nonImportableCategorySourceIds: Set<string>;
};

/**
 * Canonical, persistence-independent output of the YNAB4 launcher mapping
 * stage. Building this plan must not mutate storage. The writer below is the
 * only layer that knows the browser persistence keys used by the budget app.
 */
export interface Ynab4LauncherImportPlan {
  budgetId: string;
  accounts: SidebarAccount[];
  payees: PayeeView[];
  transactionTags: TransactionTagDefinition[];
  registers: Record<string, AccountRegisterView>;
  scheduledTransactions: ScheduledTransactionView[];
  budgetMonths: Map<string, BudgetMonthView>;
  warnings: string[];
}

export async function createYnab4LauncherBudgetImportWithBackend(
  storage: KeyValueStoragePort,
  input: CreateYnab4LauncherBudgetImportInput,
): Promise<Ynab4LauncherImportResult> {
  const rollbackSnapshot = captureYnab4LauncherImportRollbackSnapshot(storage);
  let result: Ynab4LauncherImportResult | null = null;

  try {
    result = createYnab4LauncherBudgetImport(storage, input);
    await storage.flush?.();
    return result;
  } catch (error) {
    rollbackYnab4LauncherImport(storage, {
      ...rollbackSnapshot,
      budgetId: result?.budget.id ?? null,
    });
    await storage.flush?.();
    throw error;
  }
}

export function createYnab4LauncherBudgetImport(
  storage: KeyValueStoragePort,
  input: CreateYnab4LauncherBudgetImportInput,
): Ynab4LauncherImportResult {
  const rollbackSnapshot = captureYnab4LauncherImportRollbackSnapshot(storage);
  const now = input.now ?? new Date();
  const pipeline = createYnab4LauncherImportPipeline(storage, input, now);
  let budget: BudgetSummary | null = null;

  try {
    const activeData = pipeline.validate();
    const preparedContext = pipeline.buildContext(activeData);
    budget = preparedContext.budget;

    pipeline.persist(preparedContext);
    const auditedContext = pipeline.audit(preparedContext);

    return pipeline.commit(auditedContext);
  } catch (error) {
    rollbackYnab4LauncherImport(storage, {
      ...rollbackSnapshot,
      budgetId: budget?.id ?? null,
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

interface Ynab4PreparedImportExecutionContext {
  budget: BudgetSummary;
  activeData: Ynab4ImportData;
  importPlan: Ynab4LauncherImportPlan;
  persistenceWarnings: string[];
}

interface Ynab4AuditedImportExecutionContext
  extends Ynab4PreparedImportExecutionContext {
  accuracyAudit: Ynab4LauncherImportAccuracyAuditResult;
  accuracyAuditReport: string;
}

interface Ynab4LauncherImportPipeline {
  validate(): Ynab4ImportData;
  buildContext(activeData: Ynab4ImportData): Ynab4PreparedImportExecutionContext;
  persist(context: Ynab4PreparedImportExecutionContext): void;
  audit(context: Ynab4PreparedImportExecutionContext): Ynab4AuditedImportExecutionContext;
  commit(context: Ynab4AuditedImportExecutionContext): Ynab4LauncherImportResult;
}

function createYnab4LauncherImportPipeline(
  storage: KeyValueStoragePort,
  input: CreateYnab4LauncherBudgetImportInput,
  now: Date,
): Ynab4LauncherImportPipeline {
  return {
    validate(): Ynab4ImportData {
      if (!input.discovery.isYnab4Package || !input.preview.canContinue) {
        throw new Error(
          "Cannot import YNAB4 package from launcher until preview validation passes.",
        );
      }

      if (input.preview.mode !== "new-budget") {
        throw new Error("Launcher YNAB4 imports must create a new budget.");
      }

      const activeData = readActiveYnab4BudgetData(
        input.entries,
        input.discovery.budgetDataPath,
      );
      if (!activeData) {
        throw new Error(
          "Cannot import YNAB4 package because the active Budget.yfull data could not be read.",
        );
      }

      validateYnab4TransferIntegrity(activeData);
      return activeData;
    },

    buildContext(activeData): Ynab4PreparedImportExecutionContext {
      const budgetName = createImportedBudgetName(input.preview.budgetName);
      const sourceCurrency = ynab4CurrencyCode(activeData);
      const budget = createBudgetRegistryEntry(storage, {
        name: budgetName,
        currency: sourceCurrency ?? "AUD",
        packagePath: input.discovery.packageRoot
          ? `${input.discovery.packageRoot}.budget`
          : undefined,
        preferences: input.creditCardBehaviour
          ? { creditCardBehaviour: input.creditCardBehaviour }
          : undefined,
        now,
      });

      const importPlan = buildYnab4LauncherImportPlan(budget, activeData, now);
      const persistenceWarnings = [...importPlan.warnings];
      if (!sourceCurrency) {
        persistenceWarnings.push(
          "YNAB4 currency metadata was missing or invalid; AUD was used as the compatibility fallback.",
        );
      }

      return {
        budget,
        activeData,
        importPlan,
        persistenceWarnings,
      };
    },

    persist(context): void {
      writeYnab4LauncherImportPlan(storage, context.importPlan);
    },

    audit(context): Ynab4AuditedImportExecutionContext {
      const accuracyAudit = auditYnab4LauncherImportAccuracy(storage, {
        entries: input.entries,
        budgetId: context.budget.id,
        budgetDataPath: input.discovery.budgetDataPath,
      });
      const accuracyAuditReport =
        formatYnab4LauncherImportAccuracyAuditReport(accuracyAudit);

      if (accuracyAudit.status !== "pass") {
        logYnab4LauncherImportDiagnosticReport(
          accuracyAuditReport,
          accuracyAudit.status,
        );
        throw new Error(
          `YNAB4 import accuracy audit failed. The imported data did not match the source package; no budget was saved.\n\n${accuracyAuditReport}`,
        );
      }

      return {
        ...context,
        accuracyAudit,
        accuracyAuditReport,
      };
    },

    commit(context): Ynab4LauncherImportResult {
      logYnab4LauncherImportDiagnosticReport(
        context.accuracyAuditReport,
        context.accuracyAudit.status,
      );

      return commitYnab4LauncherImport(storage, {
        budget: context.budget,
        discovery: input.discovery,
        preview: input.preview,
        persistenceWarnings: context.persistenceWarnings,
        accuracyAudit: context.accuracyAudit,
        accuracyAuditReport: context.accuracyAuditReport,
        now,
      });
    },
  };
}

function logYnab4LauncherImportDiagnosticReport(report: string, status: "pass" | "fail"): void {
  const logger = status === "pass" ? console.info : console.warn;
  logger(report);
}

export function createImportedBudgetName(sourceName: string | null): string {
  const baseName = sourceName?.trim() || "YNAB4 Budget";
  return `${baseName} Imported`;
}

export function buildYnab4LauncherImportPlan(
  budget: BudgetSummary,
  data: Ynab4ImportData,
  now: Date,
): Ynab4LauncherImportPlan {
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
    nonImportableCategorySourceIds: new Set(),
  };

  validateYnab4SourceIdentities(data);

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
  const registers = mapYnab4Transactions({
    transactions: transactionRecords,
    accounts,
    maps,
    currencyCode: budget.currency,
    importedFlagTagIdByColour: importedFlagTags.tagIdByColour,
  });
  const scheduledTransactions = mapScheduledTransactions(
    scheduledTransactionRecords,
    maps,
    nowIso,
  );
  const budgetMonths = mapYnab4BudgetMonths({
    budget,
    monthlyBudgets: toRecords(data.monthlyBudgets),
    templateGroups: categoryGroups,
    categoryIdBySourceId: maps.categoryIdBySourceId,
    registers,
    now,
  });

  return {
    budgetId: budget.id,
    accounts,
    payees,
    transactionTags: importedFlagTags.tags,
    registers,
    scheduledTransactions,
    budgetMonths,
    warnings: [],
  };
}

export function writeYnab4LauncherImportPlan(
  storage: KeyValueStoragePort,
  plan: Ynab4LauncherImportPlan,
): void {
  writeScopedJson(storage, plan.budgetId, YNAB4_ACCOUNTS_STORAGE_KEY, plan.accounts);
  writeScopedJson(storage, plan.budgetId, YNAB4_PAYEES_STORAGE_KEY, plan.payees);
  writeScopedJson(
    storage,
    plan.budgetId,
    TRANSACTION_TAGS_STORAGE_KEY,
    plan.transactionTags,
  );
  writeScopedJson(storage, plan.budgetId, YNAB4_REGISTERS_STORAGE_KEY, plan.registers);
  writeScopedJson(
    storage,
    plan.budgetId,
    YNAB4_SCHEDULED_STORAGE_KEY,
    plan.scheduledTransactions,
  );

  for (const [month, view] of plan.budgetMonths) {
    storage.setItem(
      `${YNAB4_BUDGET_VIEW_STORAGE_PREFIX}.${plan.budgetId}.${month}`,
      JSON.stringify(view),
    );
  }
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
  return accounts.flatMap((account, index) => {
    if (isYnab4Tombstone(account)) return [];
    const name = firstString(account.name, account.accountName, account.displayName) ?? `Imported Account ${index + 1}`;
    const id = uniqueSlug(name, existingIds, "account");
    for (const sourceId of accountSourceIds(account, `account:${index}`)) {
      maps.accountIdBySourceId.set(sourceId, id);
    }
    const type = mapAccountType(firstString(account.accountType, account.type), account.onBudget);
    maps.accountNameById.set(id, name);
    maps.accountTypeById.set(id, type);
    return [{
      id,
      name,
      type,
      startingBalance: explicitYnab4OpeningBalance(account),
      createdAt: nowIso,
      closedAt: isYnab4ClosedAccount(account) ? nowIso : null,
    }];
  });
}

function explicitYnab4OpeningBalance(account: RecordMap): number {
  return firstYnabDisplayAmount(
    account.startingBalance,
    account.openingBalance,
    account.initialBalance,
  ) ?? 0;
}

function isYnab4ClosedAccount(account: RecordMap): boolean {
  return account.closed === true || account.hidden === true;
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
    for (const sourceId of groupSourceIds) {
      maps.nonImportableCategorySourceIds.add(sourceId);
    }
    const subCategories = orderYnab4SubCategoriesForDisplay(toRecords(group.subCategories));
    const groupIsArchived = isYnab4Tombstone(group);
    const groupType = firstString(group.type)?.toUpperCase();

    // Match Actual Budget's YNAB4 importer: deleted category groups are not
    // imported or used as category-identity fallbacks.
    if (groupIsArchived || (groupType && groupType !== "OUTFLOW")) {
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
        for (const sourceId of categorySourceIds) maps.nonImportableCategorySourceIds.add(sourceId);
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

function mapPayees(payees: RecordMap[], maps: ImportMaps, nowIso: string): PayeeView[] {
  const existingIds = new Set<string>();
  return payees.flatMap((payee, index) => {
    if (isYnab4Tombstone(payee)) return [];
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
      isArchived: payee.hidden === true,
    }];
  });
}

function mapScheduledTransactions(transactions: RecordMap[], maps: ImportMaps, nowIso: string): ScheduledTransactionView[] {
  return transactions.flatMap((transaction, index) => {
    if (transaction.isTombstone === true || transaction.deleted === true) return [];
    const accountId = requireMappedYnab4Account(
      maps.accountIdBySourceId,
      transaction,
      `scheduled transaction ${sourceEntityLabel(transaction, index)}`,
    );
    const owningAccountType = maps.accountTypeById.get(accountId) ?? "on-budget";
    const isTrackingAccount = owningAccountType === "tracking";
    const splitLines = mapScheduledSplitLines(
      toRecords(transaction.subTransactions),
      maps,
      isTrackingAccount,
    );
    const amount = requireYnab4Amount(
      decodeYnabAmount({
        amount: transaction.amount,
        amountMilliUnits: transaction.amountMilliUnits,
        inflow: transaction.inflow,
        outflow: transaction.outflow,
      }),
      `scheduled transaction ${sourceEntityLabel(transaction, index)}`,
    );
    const transferAccountId = mappedId(maps.accountIdBySourceId, transaction.targetAccountId, transaction.transferAccountId);
    const transferAccountType = transferAccountId
      ? maps.accountTypeById.get(transferAccountId)
      : undefined;
    const payeeId = mappedId(maps.payeeIdBySourceId, transaction.payeeId);
    const sourceCategoryKind = ynab4CategoryKind(transaction.categoryId, transaction.subCategoryId);
    const mappedCategoryId =
      sourceCategoryKind === "ordinary"
        ? resolveYnab4CategoryId(
            maps,
            transaction,
            `scheduled transaction ${sourceEntityLabel(transaction, index)}`,
          )
        : null;
    const categoryId = isTrackingAccount
      ? null
      : sourceCategoryKind === "income"
        ? READY_TO_ASSIGN_CATEGORY_ID
        : sourceCategoryKind === "split"
          ? null
          : mappedCategoryId;
    const isCategorisedOffBudgetTransfer = Boolean(
      transferAccountId && categoryId && transferAccountType === "tracking",
    );
    const importedFlagColour = normaliseImportedFlagColour(
      firstString(transaction.flag, transaction.flagColor),
    );
    const recurrence = mapYnab4Recurrence(transaction);
    return [{
      id: firstString(transaction.entityId, transaction.id, transaction.scheduledTransactionId) ?? `imported-scheduled-${index}`,
      accountId,
      ...(importedFlagColour
        ? { tagIds: [`ynab4-imported-flag-${importedFlagColour}`] }
        : {}),
      nextDueDate: requireYnab4Date(
        firstString(transaction.nextDueDate, transaction.date, transaction.dateString),
        `scheduled transaction ${sourceEntityLabel(transaction, index)}`,
      ),
      frequency: recurrence.frequency,
      recurrenceInterval: recurrence.interval,
      recurrenceUnit: recurrence.unit,
      recurrenceAnchorDate: requireYnab4Date(
        firstString(transaction.nextDueDate, transaction.date, transaction.dateString),
        `scheduled transaction ${sourceEntityLabel(transaction, index)}`,
      ),
      payee: transferAccountId
        ? `Transfer: ${maps.accountNameById.get(transferAccountId) ?? "Account"}`
        : firstString(transaction.payeeName, transaction.payee) ?? (payeeId ? maps.payeeNameById.get(payeeId) : null) ?? "Imported Payee",
      payeeId: transferAccountId ? undefined : payeeId ?? undefined,
      category: isTrackingAccount
        ? transferAccountId ? "Transfer" : "Uncategorised"
        : splitLines && splitLines.length > 0
          ? "Split"
          : categoryId && (!transferAccountId || isCategorisedOffBudgetTransfer)
            ? maps.categoryNameById.get(categoryId) ??
              READY_TO_ASSIGN_CATEGORY_NAME
            : transferAccountId
              ? "Transfer"
              : READY_TO_ASSIGN_CATEGORY_NAME,
      categoryId: isTrackingAccount
        ? undefined
        : splitLines && splitLines.length > 0
          ? undefined
          : categoryId ??
            (transferAccountId ? undefined : READY_TO_ASSIGN_CATEGORY_ID),
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
    const amount = requireYnab4Amount(
      decodeYnabAmount({
        amount: line.amount,
        amountMilliUnits: line.amountMilliUnits,
        inflow: line.inflow,
        outflow: line.outflow,
      }),
      `scheduled split ${sourceEntityLabel(line, index)}`,
    );
    const sourceCategoryKind = ynab4CategoryKind(line.categoryId, line.subCategoryId);
    const transferAccountId = mappedId(
      maps.accountIdBySourceId,
      line.targetAccountId,
      line.transferAccountId,
    );
    const transferTransactionId = firstString(line.transferTransactionId);
    const lineId =
      firstString(line.entityId, line.id) ?? `scheduled-split-${index}`;
    const categoryId = suppressBudgetCategories || transferAccountId
      ? null
      : sourceCategoryKind === "income" || sourceCategoryKind === "split"
        ? READY_TO_ASSIGN_CATEGORY_ID
        : resolveYnab4CategoryId(
            maps,
            line,
            `scheduled split ${sourceEntityLabel(line, index)}`,
          ) ?? READY_TO_ASSIGN_CATEGORY_ID;
    return {
      id: lineId,
      category: suppressBudgetCategories
        ? transferAccountId
          ? "Transfer"
          : "Uncategorised"
        : transferAccountId
          ? "Transfer"
          : maps.categoryNameById.get(categoryId!) ??
            READY_TO_ASSIGN_CATEGORY_NAME,
      categoryId:
        suppressBudgetCategories || transferAccountId ? undefined : categoryId!,
      memo: firstString(line.memo, line.note, line.notes) ?? undefined,
      inflow: amount > 0 ? amount : 0,
      outflow: amount < 0 ? Math.abs(amount) : 0,
      transferId: createImportedTransferId(lineId, transferTransactionId),
      transferAccountId: transferAccountId ?? undefined,
      transferTransactionId: transferTransactionId ?? undefined,
    };
  });
}

function readActiveYnab4BudgetData(
  entries: Ynab4PackageEntry[],
  selectedBudgetDataPath: string | null,
): Ynab4ImportData | null {
  return readYnab4BudgetData(entries, selectedBudgetDataPath).data;
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

function requireMappedYnab4Account(
  map: ReadonlyMap<string, string>,
  record: RecordMap,
  source: string,
): string {
  const sourceAccountId = firstString(
    record.accountId,
    record.accountEntityId,
  );
  if (!sourceAccountId) {
    throw new Error(`Missing YNAB4 account reference for ${source}.`);
  }
  const accountId = map.get(sourceAccountId);
  if (!accountId) {
    throw new Error(
      `Unresolved YNAB4 account "${sourceAccountId}" for ${source}.`,
    );
  }
  return accountId;
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

function normaliseDate(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function requireYnab4Date(value: string | null, source: string): string {
  if (value === null) throw new Error(`Invalid or missing YNAB4 date for ${source}.`);
  const date = normaliseDate(value);
  if (!date) throw new Error(`Invalid or missing YNAB4 date for ${source}.`);
  return date;
}

function requireYnab4Amount(value: number | null, source: string): number {
  if (value === null) throw new Error(`Invalid or missing YNAB4 amount for ${source}.`);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid or missing YNAB4 amount for ${source}.`);
  }
  return value;
}

function sourceEntityLabel(record: RecordMap, index: number): string {
  return firstString(record.entityId, record.id, record.transactionId) ?? `at index ${index}`;
}

function ynab4CurrencyCode(data: Ynab4ImportData): string | null {
  const metadata = isRecord(data.budgetMetaData) ? data.budgetMetaData : null;
  const raw = metadata
    ? firstString(metadata.currencyISOSymbol, metadata.currencyCode)
    : null;
  const currency = raw?.toUpperCase();
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
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
