import {
  BUDGET_REGISTRY_STORAGE_KEY,
  createBudgetRegistryEntry,
  markBudgetOpened,
  readBudgetRegistry,
  type BudgetSummary,
} from "./budgetRegistry";
import {
  SELECTED_BUDGET_STORAGE_KEY,
  createFixedBudgetScopedStorage,
  getBudgetScopedStorageKey,
} from "./budgetDataScope";
import type { FullBudgetImportPreview } from "../../../../../packages/types/src/index";
import type { CreditCardBehaviour } from "./budgetPreferences";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import type { SidebarAccount, SidebarAccountType } from "../accounts/accountService";
import { replaceAccountEntities } from "../accounts/entities/accountEntity.js";
import { replacePayeeEntities } from "../accounts/entities/payeeEntity.js";
import { syncCategoryEntities } from "./categoryEntities.js";
import { replaceTransactionRegisters, purgeAllTransactionEntities } from "../accounts/entities/transactionEntityPersistence.js";
import { replaceScheduledTransactionEntities } from "../accounts/entities/scheduledTransactionEntity.js";
import type { AccountRegisterView, RegisterTransactionView } from "../accounts/accountRegisterTypes";
import type { PayeeView } from "../accounts/payeeService";
import type { BudgetCategoryGroupView, BudgetMonthView } from "./budgetViewTypes";
import { writeBudgetMonthEntity } from "./entities/budgetMonthEntity.js";
import { isMoneyNegative, normaliseMoney } from "./moneyMath";
import { getCurrentBudgetMonth } from "./budgetMonthNavigation";
import { provisionFreshLocalFirstBudget } from "../persistence/localFirst/freshBudgetProvisioning";
import { publishLocalBaseline } from "../persistence/localFirst/baselineCoordinator";
import { LocalBudgetDatabaseClient } from "../persistence/localFirst/localBudgetClient";
import { getOrCreateLocalFirstDeviceId } from "../persistence/localFirst/localFirstDeviceId";
import { emptyDomainCounts } from "../persistence/localFirst/contracts";
import type {
  LocalAccountRecord,
  LocalCategoryRecord,
  LocalPayeeRecord,
  LocalTransactionRecord,
  LocalTransactionSplitRecord,
} from "../persistence/localFirst/registerSchema";

export const ACTUAL_BUDGET_LAUNCHER_IMPORT_STORAGE_PREFIX =
  "budget-app.actual-budget-launcher-import.v1";

const ACCOUNTS_STORAGE_KEY = "budget-app.accounts.v1";
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
  apiBaseUrl?: string;
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
  readyToAssignCategorySourceIds: Set<string>;
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
  validateActualPreviewForImport(input.preview);

  const registryBeforeImport = storage.getItem(BUDGET_REGISTRY_STORAGE_KEY);
  const selectedBudgetBeforeImport = storage.getItem(SELECTED_BUDGET_STORAGE_KEY);
  const keysBeforeImport = new Set(storage.listKeys?.() ?? []);
  const now = input.now ?? new Date();

  let budget: BudgetSummary | null = null;
  let provisioned:
    | Awaited<ReturnType<typeof provisionFreshLocalFirstBudget>>
    | null = null;
  let database: LocalBudgetDatabaseClient | null = null;
  let staged = false;

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

    const mapped = mapActualBudgetForLocalFirst(
      budget,
      input.preview,
      now,
    );

    provisioned = await provisionFreshLocalFirstBudget(budget.id, {
      apiBaseUrl: input.apiBaseUrl,
    });

    database = new LocalBudgetDatabaseClient(undefined, storage);

    await database.beginStagedImport({
      budgetId: budget.id,
      syncEpoch: provisioned.syncEpoch,
      deviceId: getOrCreateLocalFirstDeviceId(storage),
    });
    staged = true;

    if (
      mapped.accounts.length > 0 ||
      mapped.payees.length > 0 ||
      mapped.categories.length > 0
    ) {
      await database.importRegisterBatch({
        accounts: mapped.accounts,
        payees: mapped.payees,
        categories: mapped.categories,
      });
    }

    if (mapped.transactions.length > 0) {
      await database.importRegisterBatch({
        transactions: mapped.transactions,
      });
    }

    if (mapped.budgetMonths.length > 0) {
      await database.importEntityBatch(
        mapped.budgetMonths.map(({ month, view }) => ({
          domain: "budgetMonths" as const,
          entityId: month,
          payload: view,
        })),
      );
    }

    const expectedCounts = {
      ...emptyDomainCounts(),
      accounts: mapped.accounts.length,
      transactions: mapped.transactions.length,
      payees: mapped.payees.length,
      categories: mapped.categories.length,
      budgetMonths: mapped.budgetMonths.length,
    };

    await database.commitStagedImport(expectedCounts);
    staged = false;

    await publishLocalBaseline({
      budgetId: budget.id,
      budgetName: budget.name,
      currency: budget.currency,
      syncEpoch: provisioned.syncEpoch,
      database,
      relay: provisioned.relay,
    });

    await database.close();
    database = null;

    markBudgetOpened(storage, budget.id, now);
    storage.setItem(SELECTED_BUDGET_STORAGE_KEY, budget.id);

    const record = createActualImportRecord(
      budget,
      input,
      mapped.warnings,
      now,
    );

    storage.setItem(
      getActualBudgetLauncherImportStorageKey(budget.id),
      JSON.stringify(record),
    );

    const openedBudget = markBudgetOpened(storage, budget.id, now) ?? budget;

    await storage.flush?.();

    return {
      budget: openedBudget,
      record,
      budgets: readBudgetRegistry(storage),
    };
  } catch (error) {
    if (database) {
      if (staged) {
        await database.rollbackStagedImport().catch(() => undefined);
      }
      await database.close().catch(() => undefined);
    }

    if (provisioned && budget) {
      await provisioned.relay.deleteBudget(budget.id).catch(() => undefined);
    }

    rollbackActualBudgetLauncherImport(storage, {
      budgetId: budget?.id ?? null,
      keysBeforeImport,
      registryBeforeImport,
      selectedBudgetBeforeImport,
    });

    await storage.flush?.();

    if (isStorageQuotaError(error)) {
      throw new Error(
        "Actual Budget import requires more browser storage than is available. No budget was created and no partial data was saved.",
        { cause: error },
      );
    }

    throw error;
  }
}


interface MappedActualLocalFirstBudget {
  accounts: LocalAccountRecord[];
  payees: LocalPayeeRecord[];
  categories: LocalCategoryRecord[];
  transactions: LocalTransactionRecord[];
  budgetMonths: Array<{
    month: string;
    view: BudgetMonthView;
  }>;
  warnings: string[];
}

function mapActualBudgetForLocalFirst(
  budget: BudgetSummary,
  preview: FullBudgetImportPreview,
  now: Date,
): MappedActualLocalFirstBudget {
  const nowIso = now.toISOString();

  const maps: ActualImportMaps = {
    accountIdBySourceId: new Map(),
    accountNameById: new Map(),
    accountTypeById: new Map(),
    categoryIdBySourceId: new Map(),
    categoryNameById: new Map(),
    readyToAssignCategorySourceIds: new Set(),
    payeeIdBySourceId: new Map(),
    payeeNameById: new Map(),
  };

  const sidebarAccounts = mapActualAccounts(preview, maps, nowIso);
  const categoryGroups = mapActualCategoryGroups(preview, maps);
  const payeeViews = mapActualPayees(preview, maps, nowIso);
  const registers = mapActualRegisters(preview, sidebarAccounts, maps);
  const monthViews = mapActualBudgetMonthViews(
    budget,
    categoryGroups,
    registers,
    preview,
    maps,
    now,
  );

  const accounts: LocalAccountRecord[] = sidebarAccounts.map((account) => ({
    id: account.id,
    budgetId: budget.id,
    name: account.name,
    type: account.type,
    participation: account.type === "tracking" ? "tracking" : "budget",
    openingBalance: 0,
    currencyCode: budget.currency,
    createdAt: account.createdAt,
    closedAt: account.closedAt ?? null,
  }));

  const payees: LocalPayeeRecord[] = payeeViews.map((payee) => ({
    id: payee.id,
    budgetId: budget.id,
    name: payee.name,
    note: "",
    archived: payee.isArchived === true,
    createdAt: payee.createdAt,
    updatedAt: payee.lastUsedAt,
    useCount: payee.useCount,
    lastUsedAt: payee.lastUsedAt,
  }));

  const categories: LocalCategoryRecord[] = categoryGroups.flatMap((group) =>
    group.categories.map((category) => ({
      id: category.id,
      budgetId: budget.id,
      name: category.name,
      groupId: group.id,
      groupName: group.name,
      archived: category.isArchived,
    })),
  );

  const transactions: LocalTransactionRecord[] = [];

  for (const [accountId, register] of Object.entries(registers)) {
    for (const transaction of register.transactions) {
      const splitLines: LocalTransactionSplitRecord[] =
        (transaction.splitLines ?? []).map((split) => ({
          id: split.id,
          categoryId: split.categoryId ?? null,
          categoryName: split.category ?? null,
          transferAccountId: null,
          transferTransactionId: null,
          memo: split.memo ?? null,
          amount: displayAmountToMinorUnits(split.inflow - split.outflow),
        }));

      transactions.push({
        id: transaction.id,
        budgetId: budget.id,
        accountId,
        date: transaction.date,
        amount: displayAmountToMinorUnits(
          transaction.inflow - transaction.outflow,
        ),
        memo: transaction.memo ?? null,
        checkNumber: null,
        clearedStatus: transaction.reconciled
          ? "reconciled"
          : transaction.cleared
            ? "cleared"
            : "uncleared",
        payeeId: transaction.payeeId ?? null,
        payeeName: transaction.payee ?? null,
        rawPayeeName: transaction.payee ?? null,
        categoryId: transaction.categoryId ?? null,
        categoryName: transaction.category ?? null,
        transferAccountId: transaction.transferAccountId ?? null,
        transferTransactionId: null,
        generatedFromSchedule: false,
        scheduledTransactionId: null,
        scheduledOccurrenceDate: null,
        splitLines,
        tagIds: [],
        updatedAt: nowIso,
      });
    }
  }

  const warnings = preview.entityCounts
    .filter((item) => !item.supported && item.count > 0)
    .map(
      (item) =>
        `${item.label} (${item.count.toLocaleString()}) ${
          item.note ?? "not imported yet"
        }.`,
    );

  return {
    accounts,
    payees,
    categories,
    transactions,
    budgetMonths: [...monthViews.entries()].map(([month, view]) => ({
      month,
      view,
    })),
    warnings,
  };
}

function displayAmountToMinorUnits(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

function createActualImportRecord(
  budget: BudgetSummary,
  input: CreateActualBudgetLauncherImportInput,
  persistenceWarnings: readonly string[],
  now: Date,
): ActualBudgetLauncherImportRecord {
  return {
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
      .map((item) => ({
        label: item.label,
        count: item.count,
        reason: item.note ?? "Not imported yet",
      })),
    warnings: [
      ...input.preview.issues.map((issue) => issue.message),
      ...persistenceWarnings,
    ],
    progressSteps: [
      {
        phase: "create-budget",
        label: "Created imported budget",
        detail: budget.name,
      },
      {
        phase: "accounts",
        label: "Imported accounts",
        detail: String(input.preview.accounts.length),
      },
      {
        phase: "categories",
        label: "Imported categories",
        detail: String(input.preview.categories.length),
      },
      {
        phase: "payees",
        label: "Imported payees",
        detail: String(input.preview.payees.length),
      },
      {
        phase: "transactions",
        label: "Imported transactions",
        detail: String(input.preview.transactions.length),
      },
    ],
  };
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
    readyToAssignCategorySourceIds: new Set(),
    payeeIdBySourceId: new Map(),
    payeeNameById: new Map(),
  };

  const accounts = mapActualAccounts(preview, maps, nowIso);
  const categoryGroups = mapActualCategoryGroups(preview, maps);
  const payees = mapActualPayees(preview, maps, nowIso);
  const registers = mapActualRegisters(preview, accounts, maps);
  const monthViews = mapActualBudgetMonthViews(budget, categoryGroups, registers, preview, maps, now);

  replaceAccountEntities(createFixedBudgetScopedStorage(storage, budget.id), accounts, now);
  replacePayeeEntities(createFixedBudgetScopedStorage(storage, budget.id), payees, now);
  replaceTransactionRegisters(createFixedBudgetScopedStorage(storage, budget.id), registers, now);
  replaceScheduledTransactionEntities(createFixedBudgetScopedStorage(storage, budget.id), [], now);

  const scopedStorage = createFixedBudgetScopedStorage(storage, budget.id);
  for (const [month, view] of monthViews) {
    syncCategoryEntities(scopedStorage, view, now);
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
  writeBudgetMonthEntity(storage, budgetId, month, view);
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
  const sourceGroupById = new Map(preview.categoryGroups.map((group) => [group.id, group] as const));

  for (const category of preview.categories) {
    const group = category.groupId ? sourceGroupById.get(category.groupId) ?? null : null;
    if (category.isIncome === true || group?.isIncome === true) {
      maps.readyToAssignCategorySourceIds.add(category.id);
    }
  }

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

function resolveActualTransactionCategory(
  sourceCategoryId: string | null | undefined,
  maps: ActualImportMaps,
): { categoryId: string | undefined; categoryName: string } {
  if (!sourceCategoryId) {
    return { categoryId: undefined, categoryName: "Uncategorised" };
  }

  const mappedCategoryId = maps.categoryIdBySourceId.get(sourceCategoryId);
  if (mappedCategoryId) {
    return {
      categoryId: mappedCategoryId,
      categoryName: maps.categoryNameById.get(mappedCategoryId) ?? "Uncategorised",
    };
  }

  if (maps.readyToAssignCategorySourceIds.has(sourceCategoryId)) {
    return {
      categoryId: READY_TO_ASSIGN_CATEGORY_ID,
      categoryName: READY_TO_ASSIGN_CATEGORY_NAME,
    };
  }

  return { categoryId: undefined, categoryName: "Uncategorised" };
}

function mapActualRegisterTransaction(
  transaction: FullBudgetImportPreview["transactions"][number],
  index: number,
  maps: ActualImportMaps,
): RegisterTransactionView {
  const amount = minorUnitsToDisplayAmount(transaction.amount);
  const resolvedCategory = resolveActualTransactionCategory(transaction.categoryId, maps);
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
      : transferAccountId
        ? "Transfer"
        : resolvedCategory.categoryName,
    categoryId: splitLines.length > 0 || transferAccountId
      ? undefined
      : resolvedCategory.categoryId,
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
    const resolvedCategory = resolveActualTransactionCategory(line.categoryId, maps);
    return {
      id: line.id || `${transaction.id}-split-${index + 1}`,
      category: resolvedCategory.categoryName,
      categoryId: resolvedCategory.categoryId,
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

function buildActualReadyToAssignIncomeByMonthFromRegisters(
  registers: Record<string, AccountRegisterView>,
): Map<string, number> {
  const result = new Map<string, number>();

  for (const register of Object.values(registers)) {
    if (register.accountType === "Tracking") continue;

    for (const transaction of register.transactions) {
      if (!transaction.date || !/^\d{4}-\d{2}/.test(transaction.date)) continue;
      if (transaction.transferAccountId) continue;

      const month = transaction.date.slice(0, 7);
      let amount = 0;

      if (transaction.splitLines?.length) {
        amount = transaction.splitLines.reduce((sum, line) => {
          if (line.categoryId !== READY_TO_ASSIGN_CATEGORY_ID) return sum;
          return sum + line.inflow - line.outflow;
        }, 0);
      } else if (transaction.categoryId === READY_TO_ASSIGN_CATEGORY_ID) {
        amount = transaction.inflow - transaction.outflow;
      }

      if (amount !== 0) {
        result.set(month, roundMoney((result.get(month) ?? 0) + amount));
      }
    }
  }

  return result;
}

function mapActualBudgetMonthViews(
  budget: BudgetSummary,
  templateGroups: BudgetCategoryGroupView[],
  registers: Record<string, AccountRegisterView>,
  preview: FullBudgetImportPreview,
  maps: ActualImportMaps,
  now: Date,
): Map<string, BudgetMonthView> {
  const months = new Set<string>([getCurrentBudgetMonth(now)]);
  for (const budgetMonth of preview.budgetMonths ?? []) {
    if (/^\d{4}-\d{2}$/.test(budgetMonth.month)) months.add(budgetMonth.month);
  }

  for (const register of Object.values(registers)) {
    for (const transaction of register.transactions) {
      months.add(transaction.date.slice(0, 7));
    }
  }

  const activityByMonthCategory = buildActualActivityByMonthCategoryFromRegisters(registers);
  const readyToAssignIncomeByMonth = buildActualReadyToAssignIncomeByMonthFromRegisters(registers);
  const budgetDataByMonthCategory = buildActualBudgetDataByMonthCategory(preview, maps.categoryIdBySourceId);
  const views = new Map<string, BudgetMonthView>();

  const previousAvailableByCategory = new Map<string, number>();
  let previousReadyToAssign = 0;

  const sortedMonths = [...months].sort();

  for (const [monthIndex, month] of sortedMonths.entries()) {
    const nextMonth = sortedMonths[monthIndex + 1];
    const groups = cloneCategoryGroups(templateGroups);
    const categoryById = new Map(groups.flatMap((group) => group.categories.map((category) => [category.id, category] as const)));
    const activityByCategory = activityByMonthCategory.get(month) ?? new Map<string, number>();
    const budgetDataByCategory = budgetDataByMonthCategory.get(month) ?? new Map<string, ActualBudgetCategoryMonthData>();
    const nextBudgetDataByCategory = nextMonth
      ? budgetDataByMonthCategory.get(nextMonth) ?? new Map<string, ActualBudgetCategoryMonthData>()
      : new Map<string, ActualBudgetCategoryMonthData>();

    let previousOverspending = 0;

    for (const category of categoryById.values()) {
      const budgetData = budgetDataByCategory.get(category.id);
      const nextBudgetData = nextBudgetDataByCategory.get(category.id);
      const previousAvailable = roundMoney(previousAvailableByCategory.get(category.id) ?? 0);
      const shouldCarryForward = previousAvailable > 0 || Boolean(budgetData?.carryover);

      if (previousAvailable < 0 && !budgetData?.carryover) {
        previousOverspending = roundMoney(previousOverspending + previousAvailable);
      }

      category.previousAvailable = shouldCarryForward ? previousAvailable : 0;
      category.assigned = roundMoney(budgetData?.assigned ?? 0);
      category.activity = roundMoney(activityByCategory.get(category.id) ?? 0);
      category.available = normaliseMoney(category.previousAvailable + category.assigned + category.activity);
      category.isOverspent = isMoneyNegative(category.available);

      // Actual stores carryover on the destination month. The projection
      // engine stores the rollover policy on the closing/source month.
      category.overspendingHandling = nextBudgetData?.carryover
        ? "carry-category"
        : "reduce-next-month";

      previousAvailableByCategory.set(category.id, category.available);
    }

    for (const group of groups) {
      group.previousAvailable = roundMoney(group.categories.reduce((sum, category) => sum + category.previousAvailable, 0));
      group.assigned = roundMoney(group.categories.reduce((sum, category) => sum + category.assigned, 0));
      group.activity = roundMoney(group.categories.reduce((sum, category) => sum + category.activity, 0));
      group.available = normaliseMoney(group.categories.reduce((sum, category) => sum + category.available, 0));
    }

    const totalAssigned = roundMoney(groups.reduce((sum, group) => sum + group.assigned, 0));
    const totalActivity = roundMoney(groups.reduce((sum, group) => sum + group.activity, 0));
    const totalAvailable = normaliseMoney(groups.reduce((sum, group) => sum + group.available, 0));
    const incomeForMonth = roundMoney(readyToAssignIncomeByMonth.get(month) ?? 0);
    const carriedForwardReadyToAssign = previousReadyToAssign;
    const readyToAssign = normaliseMoney(
      carriedForwardReadyToAssign +
      previousOverspending +
      incomeForMonth -
      totalAssigned,
    );

    views.set(month, {
      budgetId: budget.id,
      budgetName: budget.name,
      monthLabel: monthLabelFromIsoMonth(month),
      currencyCode: budget.currency,
      readyToAssign,
      carriedForwardReadyToAssign,
      previousOverspending,
      incomeForMonth,
      totalAssigned,
      totalActivity,
      totalAvailable,
      categoryGroups: groups,
    });

    previousReadyToAssign = readyToAssign;
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
    purgeAllTransactionEntities(createFixedBudgetScopedStorage(storage, snapshot.budgetId));

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
