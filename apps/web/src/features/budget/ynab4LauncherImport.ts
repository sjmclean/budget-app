import {
  BUDGET_REGISTRY_STORAGE_KEY,
  createBudgetRegistryEntry,
  type BudgetSummary,
} from "./budgetRegistry";
import { createFixedBudgetScopedStorage, getBudgetScopedStorageKey } from "./budgetDataScope";
import { replaceAccountEntities } from "../accounts/entities/accountEntity.js";
import { replacePayeeEntities } from "../accounts/entities/payeeEntity.js";
import { syncCategoryEntities } from "./categoryEntities.js";
import {
  BUDGET_MONTH_ENTITY_INDEX_KEY,
  writeBudgetMonthEntity,
} from "./entities/budgetMonthEntity.js";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import {
  KeyValueImportStage,
  type KeyValueImportStageResult,
  type StagedKeyValue,
} from "../persistence/keyValueImportStage";
import type { CreditCardBehaviour } from "./budgetPreferences";
import {
  readAccounts,
  type SidebarAccount,
  type SidebarAccountType,
} from "../accounts/accountService";
import type { AccountRegisterView, RegisterTransactionView } from "../accounts/accountRegisterTypes";
import type { PayeeView } from "../accounts/payeeService";
import type { ScheduledTransactionView } from "../accounts/scheduledTransactionService";
import { replaceScheduledTransactionEntities } from "../accounts/entities/scheduledTransactionEntity.js";
import {
  createTransactionEntityRepository,
} from "../accounts/entities/transactionEntity.js";
import { replaceTransactionRegisters } from "../accounts/entities/transactionEntityPersistence.js";
import {
  TRANSACTION_ENTITY_INDEX_KEY,
  TRANSACTION_ENTITY_RECORD_PREFIX,
} from "../accounts/entities/transactionEntity.js";
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
import {
  buildYnab4BudgetActivityByMonthCategory,
  mapYnab4BudgetMonths,
} from "./ynab4/mapYnab4BudgetMonths";
import {
  appendYnab4TransactionBatch,
  createYnab4TransactionRegisters,
  createImportedTransferId,
  finaliseYnab4TransactionRegisters,
  mapYnab4Transactions,
  resolveYnab4CategoryId,
} from "./ynab4/mapYnab4Transactions";
import {
  createYnab4SourceReader,
  runImportSession,
  Ynab4StreamingPreflightSession,
  type Ynab4JsonSourceReader,
  type Ynab4SmallCollections,
} from "../../../../../packages/ynab4-importer/src/source";
import { validateYnab4SourceIdentities } from "./ynab4/validateYnab4SourceIdentities";
import { isYnab4Tombstone } from "./ynab4/ynab4RecordState";
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
} from "./ynab4/importStorageKeys";
import { replaceTransactionTagEntities } from "../tags/entities/transactionTagEntity";
import type {
  TransactionTagColour,
  TransactionTagDefinition,
} from "../tags/transactionTagTypes";
import {
  type SqliteImportSession,
  type SqliteImportTransaction,
} from "../persistence/sqliteImportContracts";
import {
  LocalBudgetDatabaseClient,
  createLocalFirstRelayTransport,
  createLocalFirstYnab4ImportClient,
  publishLocalBaseline,
} from "../persistence/localFirst";
import { provisionFreshLocalFirstBudget } from "../persistence/localFirst/freshBudgetProvisioning";
import { createRuntimeUuid } from "../ids/createRuntimeUuid";

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
  signal?: AbortSignal;
  batchSize?: number;
  onProgress?: (progress: Ynab4DirectImportProgress) => void;
  /** Clean-cutover path: import directly into this device's OPFS SQLite database. */
  useLocalFirstSqlite?: boolean;
  apiBaseUrl?: string;
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
  warnings: string[];
  payeeKnowledgeAudit: Ynab4PayeeKnowledgeAudit;
};

export interface Ynab4PayeeKnowledgeDiagnostic {
  readonly code: "unresolved-default-category" | "unsupported-rename-operator" |
    "unresolved-rename-target" | "conflicting-rename-condition";
  readonly sourcePayeeId?: string;
  readonly sourceConditionId?: string;
  readonly value?: string;
  readonly message: string;
}

export interface Ynab4PayeeKnowledgeAudit {
  defaults: {
    sourcePayeesWithDefaultCategory: number;
    importedPayeeDefaultCategories: number;
    specialDefaultCategoryMappings: number;
    unresolvedDefaultCategories: number;
  };
  renameConditions: {
    total: number;
    active: number;
    tombstoned: number;
    imported: number;
    deduplicated: number;
    conflicting: number;
    unsupported: number;
    unresolvedTarget: number;
  };
  diagnostics: Ynab4PayeeKnowledgeDiagnostic[];
}

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
  payeeKnowledgeAudit?: Ynab4PayeeKnowledgeAudit;
}

export async function createYnab4LauncherBudgetImportWithBackend(
  storage: KeyValueStoragePort,
  input: CreateYnab4LauncherBudgetImportInput,
): Promise<Ynab4LauncherImportResult> {
  const rollbackSnapshot = captureYnab4LauncherImportRollbackSnapshot(storage);
  let budget: BudgetSummary | null = null;
  let reader: Ynab4JsonSourceReader | null = null;
  let localDatabase: LocalBudgetDatabaseClient | null = null;

  try {
    validateYnab4LauncherInput(input);
    input.signal?.throwIfAborted();
    const selectedEntry = findStreamingBudgetDataEntry(input);
    const selectedSource = selectedEntry.file ?? selectedEntry.text;
    if (selectedSource === undefined) {
      throw new Error(
        "Cannot import YNAB4 package because the active Budget.yfull source is unavailable.",
      );
    }
    const now = input.now ?? new Date();
    const budgetName = createImportedBudgetName(input.preview.budgetName);
    reader = createYnab4SourceReader(selectedSource, {
      sourceName: selectedEntry.path,
    });
    const referenceData = await reader.readReferenceData({
      signal: input.signal,
    });
    const sourceCurrency = ynab4CurrencyCode({
      ...referenceData.values,
      accounts: referenceData.accounts,
      masterCategories: referenceData.masterCategories,
      payees: referenceData.payees,
      monthlyBudgets: referenceData.monthlyBudgets,
    });
    const pendingRegistry = createPendingBudgetRegistryEntry(storage, {
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
    budget = pendingRegistry.budget;
    let lastProgress: Ynab4DirectImportProgress = {
      phase: "preflight",
      sourceRecordsConsumed: 0,
      persistedTransactions: 0,
      batchesPersisted: 0,
    };
    const batchSize = input.batchSize ?? 500;
    const useLocalFirstSqlite =
      input.useLocalFirstSqlite ??
      (typeof window !== "undefined");
    let localImportContext: {
      syncEpoch: string;
      relay: ReturnType<typeof createLocalFirstRelayTransport>;
    } | null = null;
    let importClient: ImportSessionClient | undefined;
    if (useLocalFirstSqlite) {
      const provisioned = await provisionFreshLocalFirstBudget(budget.id, {
        apiBaseUrl: input.apiBaseUrl,
      });
      const relay = provisioned.relay;
      localDatabase = new LocalBudgetDatabaseClient();
      importClient = createLocalFirstYnab4ImportClient({
        database: localDatabase,
        syncEpoch: provisioned.syncEpoch,
        deviceId: getOrCreateLocalFirstDeviceId(storage),
      });
      localImportContext = { syncEpoch: provisioned.syncEpoch, relay };
    }
    const staged = useLocalFirstSqlite
      ? await importYnab4ReaderToHostedSqlite(storage, reader, budget, now, {
          batchSize,
          signal: input.signal,
          importClient,
          apiBaseUrl: input.apiBaseUrl ?? (
            import.meta as ImportMeta & { env?: { VITE_BUDGET_API_URL?: string } }
          ).env?.VITE_BUDGET_API_URL,
          onProgress: (progress) => {
            lastProgress = progress;
            input.onProgress?.(progress);
          },
        })
      : await importYnab4ReaderToStage(storage, reader, budget, now, {
          id: `ynab4-${budget.id}`,
          batchSize,
          signal: input.signal,
          onProgress: (progress) => {
            lastProgress = progress;
            input.onProgress?.(progress);
          },
        });
    if (localDatabase && localImportContext) {
      await publishLocalBaseline({
        budgetId: budget.id,
        budgetName: budget.name,
        currency: budget.currency,
        syncEpoch: localImportContext.syncEpoch,
        database: localDatabase,
        relay: localImportContext.relay,
        onProgress: ({ phase }) => {
          if (phase === "uploading") input.onProgress?.({ ...lastProgress, phase: "committing" });
        },
      });
      await localDatabase.close();
      localDatabase = null;
    }
    const report = formatYnab4StreamingAuditReport(staged.audit);
    // Publish the registry entry only after all budget data has passed staged
    // audit and promotion. A browser termination during the large write can no
    // longer leave a visible empty budget.
    storage.setItem(BUDGET_REGISTRY_STORAGE_KEY, pendingRegistry.serialized);
    const result = commitYnab4LauncherImport(storage, {
      budget,
      discovery: input.discovery,
      preview: input.preview,
      persistenceWarnings: [
        ...staged.warnings,
        ...(!sourceCurrency
          ? [
              "YNAB4 currency metadata was missing or invalid; AUD was used as the compatibility fallback.",
            ]
          : []),
      ],
      accuracyAuditReport: report,
      streamingImport: {
        batchSize,
        progress: lastProgress,
        maximumCanonicalBatchRecords: staged.maximumCanonicalBatchRecords,
        audit: staged.audit,
      },
      now,
    });
    await storage.flush?.();
    return result;
  } catch (error) {
    await reader?.close();
    rollbackYnab4LauncherImport(storage, {
      ...rollbackSnapshot,
      budgetId: budget?.id ?? null,
    });
    await storage.flush?.();
    throw error;
  } finally {
    await localDatabase?.close().catch(() => undefined);
  }
}

const LOCAL_FIRST_DEVICE_ID_KEY = "budget-app.local-first.device-id";

function getOrCreateLocalFirstDeviceId(storage: KeyValueStoragePort): string {
  const existing = storage.getItem(LOCAL_FIRST_DEVICE_ID_KEY);
  if (existing) return existing;
  const id = createRuntimeUuid();
  storage.setItem(LOCAL_FIRST_DEVICE_ID_KEY, id);
  return id;
}

function createPendingBudgetRegistryEntry(
  storage: KeyValueStoragePort,
  input: Parameters<typeof createBudgetRegistryEntry>[1],
): { budget: BudgetSummary; serialized: string } {
  const values = new Map<string, string>();
  const current = storage.getItem(BUDGET_REGISTRY_STORAGE_KEY);
  if (current !== null) values.set(BUDGET_REGISTRY_STORAGE_KEY, current);
  const capture: KeyValueStoragePort = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    listKeys: () => [...values.keys()],
  };
  const budget = createBudgetRegistryEntry(capture, input);
  const serialized = capture.getItem(BUDGET_REGISTRY_STORAGE_KEY);
  if (serialized === null) {
    throw new Error("Unable to prepare the imported budget registry entry.");
  }
  return { budget, serialized };
}

function validateYnab4LauncherInput(
  input: CreateYnab4LauncherBudgetImportInput,
): void {
  if (!input.discovery.isYnab4Package || !input.preview.canContinue) {
    throw new Error(
      "Cannot import YNAB4 package from launcher until preview validation passes.",
    );
  }
  if (input.preview.mode !== "new-budget") {
    throw new Error("Launcher YNAB4 imports must create a new budget.");
  }
}

function findStreamingBudgetDataEntry(
  input: CreateYnab4LauncherBudgetImportInput,
): Ynab4PackageEntry {
  const selectedPath = input.discovery.budgetDataPath?.replaceAll("\\", "/");
  const entry = input.entries.find((candidate) =>
    candidate.selectedBudgetData ||
    (selectedPath !== null &&
      selectedPath !== undefined &&
      candidate.path.replaceAll("\\", "/") === selectedPath),
  );
  if (!entry || (entry.file === undefined && entry.text === undefined)) {
    throw new Error(
      "Cannot import YNAB4 package because the active Budget.yfull source is unavailable.",
    );
  }
  return entry;
}

function formatYnab4StreamingAuditReport(
  audit: Ynab4StreamingStagedAudit,
): string {
  return [
    "YNAB4 streaming staged audit: PASS",
    `Transactions: ${audit.transactions}`,
    `Total inflow: ${audit.totalInflow}`,
    `Total outflow: ${audit.totalOutflow}`,
  ].join("\n");
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
  const maps = createImportMaps();

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
    warnings: maps.warnings,
    payeeKnowledgeAudit: maps.payeeKnowledgeAudit,
  };
}

export interface BuildYnab4StreamingImportPlanOptions {
  batchSize?: number;
  signal?: AbortSignal;
  preflight?: boolean;
}

/**
 * Phase-3 opt-in projection path. Source transaction objects are mapped and
 * released batch-by-batch; only canonical register transactions remain.
 * Production launcher routing is intentionally unchanged.
 */
export async function buildYnab4LauncherImportPlanFromReader(
  reader: Ynab4JsonSourceReader,
  budget: BudgetSummary,
  now: Date,
  options: BuildYnab4StreamingImportPlanOptions = {},
): Promise<Ynab4LauncherImportPlan> {
  const batchSize = options.batchSize ?? 500;
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new RangeError("batchSize must be a positive integer.");
  }

  if (options.preflight !== false) {
    await runImportSession(reader, new Ynab4StreamingPreflightSession(), {
      batchSize,
      signal: options.signal,
      closeReader: false,
    });
  }

  const referenceData = await reader.readReferenceData({ signal: options.signal });
  const nowIso = now.toISOString();
  const maps = createImportMaps();
  const referenceObject: Ynab4ImportData = {
    ...referenceData.values,
    accounts: referenceData.accounts,
    masterCategories: referenceData.masterCategories,
    payees: referenceData.payees,
    monthlyBudgets: referenceData.monthlyBudgets,
    transactions: [],
    scheduledTransactions: [],
  };
  validateYnab4SourceIdentities(referenceObject);

  const accounts = mapAccounts([...referenceData.accounts], maps, nowIso);
  const categoryGroups = mapCategoryGroups([...referenceData.masterCategories], maps);
  const payees = mapPayees([...referenceData.payees], maps, nowIso);
  const registers = createYnab4TransactionRegisters(accounts, budget.currency);
  const allFlagIds = new Map<TransactionTagColour, string>(
    IMPORTED_FLAG_COLOURS.map((colour) => [colour, `ynab4-imported-flag-${colour}`]),
  );
  const observedFlags = new Set<TransactionTagColour>();

  let sourceIndexOffset = 0;
  for await (const batch of reader.streamRecords({
    batchSize,
    signal: options.signal,
  })) {
    options.signal?.throwIfAborted();
    collectImportedFlags(batch, observedFlags);
    appendYnab4TransactionBatch({
      transactions: batch,
      accounts,
      maps,
      currencyCode: budget.currency,
      importedFlagTagIdByColour: allFlagIds,
      registers,
      sourceIndexOffset,
    });
    sourceIndexOffset += batch.length;
  }
  finaliseYnab4TransactionRegisters(registers);

  const scheduledRecords: RecordMap[] = [];
  for await (const batch of reader.streamScheduledTransactions({
    batchSize,
    signal: options.signal,
  })) {
    options.signal?.throwIfAborted();
    collectImportedFlags(batch, observedFlags);
    scheduledRecords.push(...batch);
  }
  const importedFlagTags = mapImportedFlagTags(
    [...observedFlags].map((flag) => ({ flag })),
    nowIso,
  );
  const scheduledTransactions = mapScheduledTransactions(
    scheduledRecords,
    maps,
    nowIso,
  );
  const budgetMonths = mapYnab4BudgetMonths({
    budget,
    monthlyBudgets: [...referenceData.monthlyBudgets],
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
    warnings: maps.warnings,
    payeeKnowledgeAudit: maps.payeeKnowledgeAudit,
  };
}

function createImportMaps(): ImportMaps {
  return {
    accountIdBySourceId: new Map(),
    accountNameById: new Map(),
    accountTypeById: new Map(),
    categoryIdBySourceId: new Map(),
    categoryNameById: new Map(),
    categoryIsArchivedById: new Map(),
    payeeIdBySourceId: new Map(),
    payeeNameById: new Map(),
    nonImportableCategorySourceIds: new Set(),
    warnings: [],
    payeeKnowledgeAudit: createEmptyYnab4PayeeKnowledgeAudit(),
  };
}

function createEmptyYnab4PayeeKnowledgeAudit(): Ynab4PayeeKnowledgeAudit {
  return {
    defaults: {
      sourcePayeesWithDefaultCategory: 0,
      importedPayeeDefaultCategories: 0,
      specialDefaultCategoryMappings: 0,
      unresolvedDefaultCategories: 0,
    },
    renameConditions: {
      total: 0, active: 0, tombstoned: 0, imported: 0,
      deduplicated: 0, conflicting: 0, unsupported: 0, unresolvedTarget: 0,
    },
    diagnostics: [],
  };
}

function collectImportedFlags(
  records: readonly RecordMap[],
  output: Set<TransactionTagColour>,
): void {
  for (const record of records) {
    if (isYnab4Tombstone(record)) continue;
    const colour = normaliseImportedFlagColour(
      firstString(record.flag, record.flagColor),
    );
    if (colour) output.add(colour);
  }
}

export function writeYnab4LauncherImportPlan(
  storage: KeyValueStoragePort,
  plan: Ynab4LauncherImportPlan,
): void {
  replaceAccountEntities(createFixedBudgetScopedStorage(storage, plan.budgetId), plan.accounts);
  replacePayeeEntities(createFixedBudgetScopedStorage(storage, plan.budgetId), plan.payees);
  replaceTransactionTagEntities(
    createFixedBudgetScopedStorage(storage, plan.budgetId),
    plan.transactionTags,
  );
  replaceTransactionRegisters(createFixedBudgetScopedStorage(storage, plan.budgetId), plan.registers);
  replaceScheduledTransactionEntities(
    createFixedBudgetScopedStorage(storage, plan.budgetId),
    plan.scheduledTransactions,
  );

  const scopedStorage = createFixedBudgetScopedStorage(storage, plan.budgetId);
  const categoryEntitySource = [...plan.budgetMonths.values()].at(-1);
  if (categoryEntitySource) {
    // Category identity/metadata is static across imported months. Rewriting
    // every category entity for every month multiplies work without changing
    // the final state.
    syncCategoryEntities(scopedStorage, categoryEntitySource);
  }
  for (const [month, view] of plan.budgetMonths) {
    writeBudgetMonthEntity(storage, plan.budgetId, month, view);
  }
}

/**
 * Renders the small compatibility plan in memory and commits it with one
 * storage batch. This avoids opening one IndexedDB transaction (and journal
 * transaction) for every account, payee, category, schedule and month record.
 */
export async function writeYnab4LauncherImportPlanBulk(
  storage: KeyValueStoragePort,
  plan: Ynab4LauncherImportPlan,
): Promise<number> {
  const capture = createCaptureStorage();
  const existingBudgetMonthIndex = storage.getItem(BUDGET_MONTH_ENTITY_INDEX_KEY);
  if (existingBudgetMonthIndex !== null) {
    capture.storage.setItem(BUDGET_MONTH_ENTITY_INDEX_KEY, existingBudgetMonthIndex);
  }
  writeYnab4LauncherImportPlan(capture.storage, plan);
  const mutations = [...capture.values].map(([key, value]) => ({
    type: "set" as const,
    key,
    value,
  }));
  if (storage.applyMutations) {
    await storage.applyMutations(mutations);
  } else {
    for (const mutation of mutations) storage.setItem(mutation.key, mutation.value);
    await storage.flush?.();
  }
  capture.values.clear();
  return mutations.length;
}

export interface StageYnab4LauncherImportPlanOptions {
  id: string;
  batchSize?: number;
  signal?: AbortSignal;
}

/**
 * Milestone-2 opt-in persistence path. Existing entity writers render into an
 * isolated capture store, then bounded key batches are flushed to a durable
 * stage and promoted only after every write succeeds.
 */
export async function stageYnab4LauncherImportPlan(
  storage: KeyValueStoragePort,
  plan: Ynab4LauncherImportPlan,
  options: StageYnab4LauncherImportPlanOptions,
): Promise<KeyValueImportStageResult> {
  const batchSize = options.batchSize ?? 500;
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new RangeError("batchSize must be a positive integer.");
  }
  options.signal?.throwIfAborted();

  const captured = new Map<string, string>();
  const captureStorage: KeyValueStoragePort = {
    getItem: (key) => captured.get(key) ?? null,
    setItem: (key, value) => { captured.set(key, value); },
    removeItem: (key) => { captured.delete(key); },
    listKeys: () => [...captured.keys()],
  };
  const existingBudgetMonthIndex = storage.getItem(
    BUDGET_MONTH_ENTITY_INDEX_KEY,
  );
  if (existingBudgetMonthIndex !== null) {
    captureStorage.setItem(
      BUDGET_MONTH_ENTITY_INDEX_KEY,
      existingBudgetMonthIndex,
    );
  }
  writeYnab4LauncherImportPlan(captureStorage, plan);

  const stage = new KeyValueImportStage({
    storage,
    id: options.id,
    targetPrefix: "budget-app.",
    allowOverwrite: (key) => key === BUDGET_MONTH_ENTITY_INDEX_KEY,
  });
  await stage.begin({ signal: options.signal });
  try {
    let batch: StagedKeyValue[] = [];
    for (const [key, value] of captured) {
      options.signal?.throwIfAborted();
      batch.push({ key, value });
      if (batch.length === batchSize) {
        await stage.persistBatch(batch, { signal: options.signal });
        batch = [];
      }
    }
    if (batch.length > 0) {
      await stage.persistBatch(batch, { signal: options.signal });
    }
    captured.clear();
    return await stage.commit({ signal: options.signal });
  } catch (error) {
    captured.clear();
    await stage.rollback(error);
    throw error;
  } finally {
    await stage.close();
  }
}

export interface ImportYnab4ReaderToStageOptions
  extends StageYnab4LauncherImportPlanOptions {
  preflight?: boolean;
  closeReader?: boolean;
  onProgress?: (progress: Ynab4DirectImportProgress) => void;
}

export interface Ynab4DirectImportProgress {
  phase: "preflight" | "reference-data" | "transactions" | "scheduled" | "finalising" | "committing";
  sourceRecordsConsumed: number;
  persistedTransactions: number;
  batchesPersisted: number;
}

export interface ImportYnab4ReaderToStageResult
  extends KeyValueImportStageResult {
  transactionCount: number;
  scheduledTransactionCount: number;
  warnings: readonly string[];
  maximumCanonicalBatchRecords: number;
  audit: Ynab4StreamingStagedAudit;
  payeeKnowledgeAudit: Ynab4PayeeKnowledgeAudit;
}

export interface Ynab4StreamingStagedAudit {
  status: "pass";
  transactions: number;
  totalInflow: number;
  totalOutflow: number;
}

export interface ImportYnab4ReaderToHostedSqliteOptions {
  readonly batchSize?: number;
  readonly signal?: AbortSignal;
  readonly apiBaseUrl?: string;
  readonly onProgress?: (progress: Ynab4DirectImportProgress) => void;
  readonly importClient?: ImportSessionClient;
}

interface ImportSessionClient {
  begin(input: {
    readonly budgetId: string;
    readonly budgetName: string;
    readonly currency: string;
    readonly signal?: AbortSignal;
  }): Promise<SqliteImportSession>;
}

/**
 * Streams the large transaction collection into a capability-shaped staged
 * SQLite destination. Production browser imports supply the local OPFS SQLite
 * implementation and activate it atomically after relational validation.
 */
export async function importYnab4ReaderToHostedSqlite(
  storage: KeyValueStoragePort,
  reader: Ynab4JsonSourceReader,
  budget: BudgetSummary,
  now: Date,
  options: ImportYnab4ReaderToHostedSqliteOptions = {},
): Promise<ImportYnab4ReaderToStageResult> {
  const batchSize = Math.min(options.batchSize ?? 500, 2_000);
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new RangeError("batchSize must be a positive integer.");
  }
  const client = options.importClient;
  if (!client) {
    throw new Error(
      "A local-first staged import destination is required; hosted SQLite import has been retired.",
    );
  }
  let session: Awaited<ReturnType<typeof client.begin>> | null = null;
  let sourceRecordsConsumed = 0;
  let persistedTransactions = 0;
  let batchesPersisted = 0;
  let expectedInflow = 0;
  let expectedOutflow = 0;
  let maximumCanonicalBatchRecords = 0;
  const preflight = new Ynab4StreamingPreflightSession();
  let preflightBegun = false;
  const report = (phase: Ynab4DirectImportProgress["phase"]) =>
    options.onProgress?.({
      phase,
      sourceRecordsConsumed,
      persistedTransactions,
      batchesPersisted,
    });

  try {
    report("preflight");
    const summary = await reader.inspect({ signal: options.signal });
    const referenceData = await reader.readReferenceData({ signal: options.signal });
    const validation = await preflight.validateSource(summary, referenceData, {
      signal: options.signal,
    });
    if (!validation.valid) {
      throw new Error(validation.issues.map((issue) => issue.message).join("\n"));
    }
    await preflight.begin();
    preflightBegun = true;

    report("reference-data");
    const nowIso = now.toISOString();
    const maps = createImportMaps();
    validateYnab4SourceIdentities({
      ...referenceData.values,
      accounts: referenceData.accounts,
      masterCategories: referenceData.masterCategories,
      payees: referenceData.payees,
      monthlyBudgets: referenceData.monthlyBudgets,
      transactions: [],
      scheduledTransactions: [],
    });
    const accounts = mapAccounts([...referenceData.accounts], maps, nowIso);
    const categoryGroups = mapCategoryGroups([...referenceData.masterCategories], maps);
    const payees = mapPayees([...referenceData.payees], maps, nowIso);
    session = await client.begin({
      budgetId: budget.id,
      budgetName: budget.name,
      currency: budget.currency,
      signal: options.signal,
    });
    await session.persistReferenceData({
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        type: account.type,
        participation: account.type === "tracking" ? "off-budget" : "on-budget",
        openingBalance: toMinorUnits(account.startingBalance),
        closedAt: account.closedAt ?? null,
      })),
      payees: payees.map((payee) => ({
        id: payee.id,
        name: payee.name,
        archived: payee.isArchived,
        defaultCategoryId: payee.defaultCategoryId,
        defaultCategoryName: payee.defaultCategoryName,
        importRules: payee.importRules,
      })),
      categories: categoryGroups.flatMap((group, groupIndex) =>
        group.categories.map((category, categoryIndex) => ({
          id: category.id,
          name: category.name,
          groupId: group.id,
          groupName: group.name,
          sortOrder: groupIndex * 100_000 + categoryIndex,
        })),
      ),
    }, { signal: options.signal });

    const allFlagIds = new Map<TransactionTagColour, string>(
      IMPORTED_FLAG_COLOURS.map((colour) => [colour, `ynab4-imported-flag-${colour}`]),
    );
    const observedFlags = new Set<TransactionTagColour>();
    const activityByMonthCategory = new Map<string, Map<string, number>>();
    let sourceIndexOffset = 0;

    for await (const batch of reader.streamRecords({
      batchSize,
      signal: options.signal,
    })) {
      options.signal?.throwIfAborted();
      await preflight.persistBatch(batch, { signal: options.signal });
      collectImportedFlags(batch, observedFlags);
      const batchRegisters = createYnab4TransactionRegisters(accounts, budget.currency);
      appendYnab4TransactionBatch({
        transactions: batch,
        accounts,
        maps,
        currencyCode: budget.currency,
        importedFlagTagIdByColour: allFlagIds,
        registers: batchRegisters,
        sourceIndexOffset,
      });
      sourceIndexOffset += batch.length;
      sourceRecordsConsumed += batch.length;
      mergeYnab4Activity(
        activityByMonthCategory,
        buildYnab4BudgetActivityByMonthCategory(batchRegisters),
      );
      const sqliteRows: SqliteImportTransaction[] = [];
      for (const [accountId, register] of Object.entries(batchRegisters)) {
        for (const transaction of register.transactions) {
          sqliteRows.push(toSqliteImportTransaction(accountId, transaction, now));
          persistedTransactions += 1;
          expectedInflow += transaction.inflow;
          expectedOutflow += transaction.outflow;
        }
        register.transactions.length = 0;
      }
      maximumCanonicalBatchRecords = Math.max(
        maximumCanonicalBatchRecords,
        sqliteRows.length,
      );
      if (sqliteRows.length > 0) {
        await session.persistTransactions(sqliteRows, { signal: options.signal });
      }
      batchesPersisted += 1;
      report("transactions");
    }
    await preflight.commit();

    report("scheduled");
    const scheduledRecords: RecordMap[] = [];
    for await (const batch of reader.streamScheduledTransactions({
      batchSize,
      signal: options.signal,
    })) {
      collectImportedFlags(batch, observedFlags);
      scheduledRecords.push(...batch);
    }
    const importedFlagTags = mapImportedFlagTags(
      [...observedFlags].map((flag) => ({ flag })),
      nowIso,
    );
    await session.persistTransactionTags?.(
      importedFlagTags.tags.map((tag) => ({ id: tag.id, payload: tag })),
      { signal: options.signal },
    );
    const scheduledTransactions = mapScheduledTransactions(scheduledRecords, maps, nowIso);
    await session.persistScheduledTransactions(scheduledTransactions, {
      signal: options.signal,
    });
    const budgetMonths = mapYnab4BudgetMonths({
      budget,
      monthlyBudgets: [...referenceData.monthlyBudgets],
      templateGroups: categoryGroups,
      categoryIdBySourceId: maps.categoryIdBySourceId,
      registers: {},
      activityByMonthCategory,
      now,
    });
    await session.persistBudgetMonths(
      [...budgetMonths].map(([month, view]) => ({ month, view })),
      { signal: options.signal },
    );

    report("finalising");
    await session.validate({ signal: options.signal });
    const smallPlan: Ynab4LauncherImportPlan = {
      budgetId: budget.id,
      accounts,
      payees,
      transactionTags: importedFlagTags.tags,
      registers: {},
      scheduledTransactions,
      budgetMonths,
      warnings: maps.warnings,
    };
    await writeYnab4LauncherImportPlanBulk(storage, smallPlan);
    report("committing");
    await session.commit({ signal: options.signal });
    session = null;
    return {
      id: `sqlite:${budget.id}`,
      keysPromoted: 0,
      recordsPersisted: persistedTransactions,
      transactionCount: persistedTransactions,
      scheduledTransactionCount: scheduledTransactions.length,
      warnings: [...maps.warnings],
      maximumCanonicalBatchRecords,
      audit: {
        status: "pass",
        transactions: persistedTransactions,
        totalInflow: expectedInflow,
        totalOutflow: expectedOutflow,
      },
      payeeKnowledgeAudit: maps.payeeKnowledgeAudit,
    };
  } catch (error) {
    if (preflightBegun) await preflight.rollback();
    await session?.cancel().catch(() => undefined);
    throw error;
  } finally {
    await preflight.close();
    await reader.close();
  }
}

function toSqliteImportTransaction(
  accountId: string,
  transaction: RegisterTransactionView,
  now: Date,
): SqliteImportTransaction {
  return {
    id: transaction.id,
    accountId,
    payeeId: transaction.payeeId ?? null,
    categoryId: transaction.categoryId ?? null,
    categoryName: transaction.transferAccountId
      ? "Transfer"
      : transaction.category ?? null,
    transferAccountId: transaction.transferAccountId ?? null,
    transferTransactionId: transaction.transferTransactionId ?? null,
    splitLines: (transaction.splitLines ?? []).map((line) => ({
      id: line.id,
      categoryId: line.categoryId ?? null,
      categoryName: line.transferAccountId ? "Transfer" : line.category ?? null,
      transferAccountId: line.transferAccountId ?? null,
      transferTransactionId: line.transferTransactionId ?? null,
      memo: line.memo ?? null,
      amount: toMinorUnits(line.inflow - line.outflow),
    })),
    type: transaction.splitLines?.length ? "split" : transaction.transferAccountId ? "transfer" : "standard",
    date: transaction.date,
    memo: transaction.memo ?? null,
    checkNumber: transaction.checkNumber ?? null,
    amount: toMinorUnits(transaction.inflow - transaction.outflow),
    clearedStatus: transaction.reconciled
      ? "reconciled"
      : transaction.cleared
        ? "cleared"
        : "uncleared",
    createdAt: now.getTime(),
    updatedAt: now.getTime(),
    tagIds: transaction.tagIds ?? [],
  };
}

function toMinorUnits(value: number): number {
  return Math.round(value * 100);
}

/**
 * Milestone-2 direct path. Each source transaction batch is mapped, encoded as
 * replicated transaction entities, persisted to the isolated stage, and then
 * released. Only transaction IDs and month/category activity totals survive
 * across batches.
 */
export async function importYnab4ReaderToStage(
  storage: KeyValueStoragePort,
  reader: Ynab4JsonSourceReader,
  budget: BudgetSummary,
  now: Date,
  options: ImportYnab4ReaderToStageOptions,
): Promise<ImportYnab4ReaderToStageResult> {
  const batchSize = options.batchSize ?? 500;
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new RangeError("batchSize must be a positive integer.");
  }
  const stage = new KeyValueImportStage({
    storage,
    id: options.id,
    targetPrefix: "budget-app.",
    allowOverwrite: (key) => key === BUDGET_MONTH_ENTITY_INDEX_KEY,
  });
  let stageBegun = false;
  let sourceRecordsConsumed = 0;
  let persistedTransactions = 0;
  let batchesPersisted = 0;
  let maximumCanonicalBatchRecords = 0;
  let expectedInflow = 0;
  let expectedOutflow = 0;
  const preflight = options.preflight === false
    ? null
    : new Ynab4StreamingPreflightSession();
  let preflightBegun = false;
  const report = (phase: Ynab4DirectImportProgress["phase"]) =>
    options.onProgress?.({
      phase,
      sourceRecordsConsumed,
      persistedTransactions,
      batchesPersisted,
    });
  try {
    let referenceData: Ynab4SmallCollections | undefined;
    if (preflight) {
      report("preflight");
      const summary = await reader.inspect({ signal: options.signal });
      referenceData = await reader.readReferenceData({ signal: options.signal });
      const validation = await preflight.validateSource(
        summary,
        referenceData,
        { signal: options.signal },
      );
      if (!validation.valid) {
        throw new Error(
          validation.issues.map((issue) => issue.message).join("\n"),
        );
      }
      await preflight.begin();
      preflightBegun = true;
    }
    report("reference-data");
    referenceData ??= await reader.readReferenceData({ signal: options.signal });
    const nowIso = now.toISOString();
    const maps = createImportMaps();
    validateYnab4SourceIdentities({
      ...referenceData.values,
      accounts: referenceData.accounts,
      masterCategories: referenceData.masterCategories,
      payees: referenceData.payees,
      monthlyBudgets: referenceData.monthlyBudgets,
      transactions: [],
      scheduledTransactions: [],
    });
    const accounts = mapAccounts([...referenceData.accounts], maps, nowIso);
    const categoryGroups = mapCategoryGroups([...referenceData.masterCategories], maps);
    const payees = mapPayees([...referenceData.payees], maps, nowIso);
    const allFlagIds = new Map<TransactionTagColour, string>(
      IMPORTED_FLAG_COLOURS.map((colour) => [colour, `ynab4-imported-flag-${colour}`]),
    );
    const observedFlags = new Set<TransactionTagColour>();
    const transactionIds: string[] = [];
    const activityByMonthCategory = new Map<string, Map<string, number>>();

    await stage.begin({ signal: options.signal });
    stageBegun = true;
    let sourceIndexOffset = 0;
    for await (const batch of reader.streamRecords({ batchSize, signal: options.signal })) {
      options.signal?.throwIfAborted();
      await preflight?.persistBatch(batch, { signal: options.signal });
      collectImportedFlags(batch, observedFlags);
      const batchRegisters = createYnab4TransactionRegisters(accounts, budget.currency);
      appendYnab4TransactionBatch({
        transactions: batch,
        accounts,
        maps,
        currencyCode: budget.currency,
        importedFlagTagIdByColour: allFlagIds,
        registers: batchRegisters,
        sourceIndexOffset,
      });
      sourceIndexOffset += batch.length;
      sourceRecordsConsumed += batch.length;
      mergeYnab4Activity(
        activityByMonthCategory,
        buildYnab4BudgetActivityByMonthCategory(batchRegisters),
      );

      const capture = createCaptureStorage();
      replaceTransactionRegisters(
        createFixedBudgetScopedStorage(capture.storage, budget.id),
        batchRegisters,
        now,
      );
      const entityEntries = [...capture.values]
        .filter(([key]) => key.includes(TRANSACTION_ENTITY_RECORD_PREFIX))
        .map(([key, value]) => ({ key, value }));
      const canonicalBatchRecords = Object.values(batchRegisters).reduce(
        (count, register) => count + register.transactions.length,
        0,
      );
      maximumCanonicalBatchRecords = Math.max(
        maximumCanonicalBatchRecords,
        canonicalBatchRecords,
      );
      for (const register of Object.values(batchRegisters)) {
        for (const transaction of register.transactions) {
          transactionIds.push(transaction.id);
          persistedTransactions += 1;
          expectedInflow += transaction.inflow;
          expectedOutflow += transaction.outflow;
        }
        register.transactions.length = 0;
      }
      await stage.persistBatch(entityEntries, { signal: options.signal });
      batchesPersisted += 1;
      report("transactions");
    }
    await preflight?.commit();

    report("scheduled");
    const scheduledRecords: RecordMap[] = [];
    for await (const batch of reader.streamScheduledTransactions({
      batchSize,
      signal: options.signal,
    })) {
      options.signal?.throwIfAborted();
      collectImportedFlags(batch, observedFlags);
      scheduledRecords.push(...batch);
    }
    const importedFlagTags = mapImportedFlagTags(
      [...observedFlags].map((flag) => ({ flag })),
      nowIso,
    );
    const scheduledTransactions = mapScheduledTransactions(scheduledRecords, maps, nowIso);
    const budgetMonths = mapYnab4BudgetMonths({
      budget,
      monthlyBudgets: [...referenceData.monthlyBudgets],
      templateGroups: categoryGroups,
      categoryIdBySourceId: maps.categoryIdBySourceId,
      registers: {},
      activityByMonthCategory,
      now,
    });
    const smallPlan: Ynab4LauncherImportPlan = {
      budgetId: budget.id,
      accounts,
      payees,
      transactionTags: importedFlagTags.tags,
      registers: {},
      scheduledTransactions,
      budgetMonths,
      warnings: maps.warnings,
    };
    report("finalising");
    const smallCapture = createCaptureStorage();
    const existingBudgetMonthIndex = storage.getItem(
      BUDGET_MONTH_ENTITY_INDEX_KEY,
    );
    if (existingBudgetMonthIndex !== null) {
      smallCapture.storage.setItem(
        BUDGET_MONTH_ENTITY_INDEX_KEY,
        existingBudgetMonthIndex,
      );
    }
    writeYnab4LauncherImportPlan(smallCapture.storage, smallPlan);
    const transactionIndexKey = getBudgetScopedStorageKey(
      budget.id,
      TRANSACTION_ENTITY_INDEX_KEY,
    );
    const smallEntries: StagedKeyValue[] = [...smallCapture.values]
      .filter(([key]) =>
        !key.includes(TRANSACTION_ENTITY_RECORD_PREFIX) &&
        key !== transactionIndexKey,
      )
      .map(([key, value]) => ({ key, value }));
    smallEntries.push({
      key: transactionIndexKey,
      value: JSON.stringify([...new Set(transactionIds)].sort()),
    });
    for (let offset = 0; offset < smallEntries.length; offset += batchSize) {
      await stage.persistBatch(
        smallEntries.slice(offset, offset + batchSize),
        { signal: options.signal },
      );
      batchesPersisted += 1;
    }
    const stagedReadView = stage.createReadView();
    const stagedAccounts = readAccounts(
      createFixedBudgetScopedStorage(stagedReadView, budget.id),
    );
    if (
      stagedAccounts.length !== accounts.length ||
      stagedAccounts.some((account) =>
        !accounts.some((expected) => expected.id === account.id))
    ) {
      throw new Error(
        "Streaming YNAB4 staged audit failed: imported accounts are incomplete.",
      );
    }
    const audit = auditYnab4StagedTransactions(
      stagedReadView,
      budget.id,
      transactionIds,
      expectedInflow,
      expectedOutflow,
    );
    report("committing");
    const committed = await stage.commit({ signal: options.signal });
    const transactionCount = transactionIds.length;
    transactionIds.length = 0;
    activityByMonthCategory.clear();
    return {
      ...committed,
      transactionCount,
      scheduledTransactionCount: scheduledTransactions.length,
      warnings: [...maps.warnings],
      maximumCanonicalBatchRecords,
      audit,
      payeeKnowledgeAudit: maps.payeeKnowledgeAudit,
    };
  } catch (error) {
    if (preflightBegun) await preflight?.rollback();
    if (stageBegun) {
      await stage.rollback(error);
      await stage.cleanup();
    }
    throw error;
  } finally {
    await preflight?.close();
    if (stageBegun) await stage.close();
    if (options.closeReader !== false) await reader.close();
  }
}

function auditYnab4StagedTransactions(
  stagedStorage: KeyValueStoragePort,
  budgetId: string,
  transactionIds: readonly string[],
  expectedInflow: number,
  expectedOutflow: number,
): Ynab4StreamingStagedAudit {
  const repository = createTransactionEntityRepository(
    createFixedBudgetScopedStorage(stagedStorage, budgetId),
  );
  const idsToVerify = selectYnab4StagedAuditTransactionIds(transactionIds);
  let actualInflow = 0;
  let actualOutflow = 0;
  let actualCount = 0;
  for (const id of idsToVerify) {
    const entity = repository.get(id);
    if (!entity || entity.metadata.tombstone !== null) {
      throw new Error(`Streaming YNAB4 audit could not read staged transaction "${id}".`);
    }
    actualCount += 1;
    actualInflow += entity.fields.inflow.value;
    actualOutflow += entity.fields.outflow.value;
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  if (actualCount !== idsToVerify.length) {
    throw new Error(
      "Streaming YNAB4 staged audit failed: persisted transaction samples are incomplete.",
    );
  }
  if (
    idsToVerify.length === transactionIds.length &&
    (
      round(actualInflow) !== round(expectedInflow) ||
      round(actualOutflow) !== round(expectedOutflow)
    )
  ) {
    throw new Error(
      "Streaming YNAB4 staged audit failed: transaction monetary totals differ.",
    );
  }
  return {
    status: "pass",
    transactions: transactionIds.length,
    totalInflow: round(expectedInflow),
    totalOutflow: round(expectedOutflow),
  };
}

const FULL_STAGED_AUDIT_TRANSACTION_LIMIT = 25_000;
const LARGE_STAGED_AUDIT_SAMPLE_SIZE = 256;

export function selectYnab4StagedAuditTransactionIds(
  transactionIds: readonly string[],
): readonly string[] {
  if (transactionIds.length <= FULL_STAGED_AUDIT_TRANSACTION_LIMIT) {
    return transactionIds;
  }
  const selected = new Set<string>();
  const lastIndex = transactionIds.length - 1;
  for (let sample = 0; sample < LARGE_STAGED_AUDIT_SAMPLE_SIZE; sample += 1) {
    const index = Math.round(
      (sample * lastIndex) / (LARGE_STAGED_AUDIT_SAMPLE_SIZE - 1),
    );
    selected.add(transactionIds[index]!);
  }
  return [...selected];
}

function createCaptureStorage(): {
  storage: KeyValueStoragePort;
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
      listKeys: () => [...values.keys()],
    },
  };
}

function mergeYnab4Activity(
  target: Map<string, Map<string, number>>,
  source: ReadonlyMap<string, ReadonlyMap<string, number>>,
): void {
  for (const [month, sourceCategories] of source) {
    const targetCategories = target.get(month) ?? new Map<string, number>();
    for (const [categoryId, amount] of sourceCategories) {
      targetCategories.set(categoryId, (targetCategories.get(categoryId) ?? 0) + amount);
    }
    target.set(month, targetCategories);
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
  const activeSourcePayees: Array<{ source: RecordMap; sourceId: string; payee: PayeeView }> = [];
  const result = payees.flatMap((source, index) => {
    const payee = source;
    if (isYnab4Tombstone(payee)) return [];
    const name = firstString(payee.name, payee.payeeName, payee.displayName) ?? `Imported Payee ${index + 1}`;
    if (isTransferPayee(payee, name)) {
      return [];
    }
    const id = uniqueSlug(name, existingIds, "payee");
    const sourceIds = payeeSourceIds(payee, `payee:${index}`);
    for (const sourceId of sourceIds) {
      maps.payeeIdBySourceId.set(sourceId, id);
    }
    maps.payeeNameById.set(id, name);
    const mapped: PayeeView = {
      id,
      name,
      createdAt: nowIso,
      lastUsedAt: nowIso,
      useCount: 1,
      // YNAB4's enabled flag is the source-side "List and autocomplete this
      // payee" switch. Archiving is the existing Budget App state that keeps
      // the record manageable while excluding it from entry suggestions.
      isArchived: payee.hidden === true || payee.enabled === false,
    };
    activeSourcePayees.push({ source, sourceId: sourceIds[0], payee: mapped });
    return [mapped];
  });

  for (const entry of activeSourcePayees) {
    const sourceCategoryId = firstString(entry.source.autoFillCategoryId);
    if (!sourceCategoryId) continue;
    maps.payeeKnowledgeAudit.defaults.sourcePayeesWithDefaultCategory += 1;
    const special = sourceCategoryId === YNAB4_IMMEDIATE_INCOME_CATEGORY_ID ||
      sourceCategoryId === YNAB4_DEFERRED_INCOME_CATEGORY_ID;
    const categoryId = special
      ? READY_TO_ASSIGN_CATEGORY_ID
      : maps.categoryIdBySourceId.get(sourceCategoryId);
    const categoryName = special
      ? READY_TO_ASSIGN_CATEGORY_NAME
      : categoryId ? maps.categoryNameById.get(categoryId) : undefined;
    if (categoryId && categoryName) {
      entry.payee.defaultCategoryId = categoryId;
      entry.payee.defaultCategoryName = categoryName;
      maps.payeeKnowledgeAudit.defaults.importedPayeeDefaultCategories += 1;
      if (special) maps.payeeKnowledgeAudit.defaults.specialDefaultCategoryMappings += 1;
    } else {
      maps.payeeKnowledgeAudit.defaults.unresolvedDefaultCategories += 1;
      addPayeeKnowledgeDiagnostic(maps, {
        code: "unresolved-default-category",
        sourcePayeeId: entry.sourceId,
        value: sourceCategoryId,
        message: `YNAB4 payee ${entry.sourceId} references an unavailable default category ${sourceCategoryId}.`,
      });
    }
  }

  type RuleCandidate = {
    target: typeof activeSourcePayees[number];
    conditionId: string;
    matchType: "equals" | "contains";
    text: string;
  };
  const candidates: RuleCandidate[] = [];
  for (const owner of activeSourcePayees) {
    for (const [index, condition] of toRecords(owner.source.renameConditions).entries()) {
      maps.payeeKnowledgeAudit.renameConditions.total += 1;
      if (isYnab4Tombstone(condition)) {
        maps.payeeKnowledgeAudit.renameConditions.tombstoned += 1;
        continue;
      }
      maps.payeeKnowledgeAudit.renameConditions.active += 1;
      const conditionId = firstString(condition.entityId, condition.id) ?? `${owner.sourceId}:condition:${index}`;
      const targetSourceId = firstString(condition.parentPayeeId) ?? owner.sourceId;
      const targetId = maps.payeeIdBySourceId.get(targetSourceId);
      const target = activeSourcePayees.find((entry) => entry.payee.id === targetId);
      if (!target) {
        maps.payeeKnowledgeAudit.renameConditions.unresolvedTarget += 1;
        addPayeeKnowledgeDiagnostic(maps, {
          code: "unresolved-rename-target", sourcePayeeId: owner.sourceId,
          sourceConditionId: conditionId, value: targetSourceId,
          message: `YNAB4 rename condition ${conditionId} targets unavailable payee ${targetSourceId}.`,
        });
        continue;
      }
      const operator = firstString(condition.operator);
      const matchType = operator === "Is" ? "equals" : operator === "Contains" ? "contains" : null;
      if (!matchType) {
        maps.payeeKnowledgeAudit.renameConditions.unsupported += 1;
        addPayeeKnowledgeDiagnostic(maps, {
          code: "unsupported-rename-operator", sourcePayeeId: owner.sourceId,
          sourceConditionId: conditionId, value: operator ?? "",
          message: `YNAB4 rename condition ${conditionId} uses unsupported operator ${operator ?? "(missing)"}.`,
        });
        continue;
      }
      const text = firstString(condition.operand)?.trim() ?? "";
      if (!text) {
        maps.payeeKnowledgeAudit.renameConditions.unsupported += 1;
        addPayeeKnowledgeDiagnostic(maps, {
          code: "unsupported-rename-operator", sourcePayeeId: owner.sourceId,
          sourceConditionId: conditionId, value: "",
          message: `YNAB4 rename condition ${conditionId} has no usable operand.`,
        });
        continue;
      }
      candidates.push({ target, conditionId, matchType, text });
    }
  }

  const bySemanticCondition = new Map<string, RuleCandidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.matchType}\u0000${candidate.text.toLocaleLowerCase()}`;
    const group = bySemanticCondition.get(key) ?? [];
    group.push(candidate);
    bySemanticCondition.set(key, group);
  }
  const ruleIds = new Set<string>();
  for (const group of bySemanticCondition.values()) {
    const targetIds = new Set(group.map(({ target }) => target.payee.id));
    if (targetIds.size > 1) {
      maps.payeeKnowledgeAudit.renameConditions.conflicting += group.length;
      for (const candidate of group) addPayeeKnowledgeDiagnostic(maps, {
        code: "conflicting-rename-condition", sourcePayeeId: candidate.target.sourceId,
        sourceConditionId: candidate.conditionId, value: candidate.text,
        message: `YNAB4 rename condition ${candidate.conditionId} conflicts with another active target and was not activated.`,
      });
      continue;
    }
    const candidate = group[0];
    maps.payeeKnowledgeAudit.renameConditions.deduplicated += group.length - 1;
    const ruleId = uniqueSlug(candidate.conditionId, ruleIds, "ynab4-rename-rule");
    candidate.target.payee.importRules = [
      ...(candidate.target.payee.importRules ?? []),
      {
        id: ruleId,
        matchType: candidate.matchType,
        text: candidate.text,
        defaultCategoryId: candidate.target.payee.defaultCategoryId,
        defaultCategoryName: candidate.target.payee.defaultCategoryName,
        priority: candidate.matchType === "equals" ? 100 : 50,
        enabled: true,
      },
    ];
    maps.payeeKnowledgeAudit.renameConditions.imported += 1;
  }
  return result;
}

function addPayeeKnowledgeDiagnostic(
  maps: ImportMaps,
  diagnostic: Ynab4PayeeKnowledgeDiagnostic,
): void {
  maps.payeeKnowledgeAudit.diagnostics.push(diagnostic);
  maps.warnings.push(diagnostic.message);
}

function mapScheduledTransactions(transactions: RecordMap[], maps: ImportMaps, nowIso: string): ScheduledTransactionView[] {
  return transactions.flatMap((transaction, index) => {
    if (isYnab4Tombstone(transaction)) return [];
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
          : transferAccountId && !isCategorisedOffBudgetTransfer
            ? "Transfer"
            : categoryId
              ? maps.categoryNameById.get(categoryId) ??
                READY_TO_ASSIGN_CATEGORY_NAME
              : "Uncategorised",
      categoryId: isTrackingAccount || (splitLines && splitLines.length > 0)
        ? undefined
        : transferAccountId && !isCategorisedOffBudgetTransfer
          ? undefined
          : categoryId ?? undefined,
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
          );
    return {
      id: lineId,
      category: suppressBudgetCategories
        ? transferAccountId
          ? "Transfer"
          : "Uncategorised"
        : transferAccountId
          ? "Transfer"
          : categoryId
            ? maps.categoryNameById.get(categoryId) ??
              READY_TO_ASSIGN_CATEGORY_NAME
            : "Uncategorised",
      categoryId:
        suppressBudgetCategories || transferAccountId
          ? undefined
          : categoryId ?? undefined,
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
    if (isYnab4Tombstone(transaction)) {
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
  if (!metadata) return null;

  const explicitCurrency = firstString(
    metadata.currencyISOSymbol,
    metadata.currencyCode,
  )?.toUpperCase();
  if (explicitCurrency && /^[A-Z]{3}$/.test(explicitCurrency)) {
    return explicitCurrency;
  }

  return currencyCodeFromYnab4Locale(
    firstString(metadata.currencyLocale, metadata.dateLocale),
  );
}

function currencyCodeFromYnab4Locale(locale: string | null): string | null {
  if (!locale) return null;

  const normalisedLocale = locale.replace(/_/g, "-");
  let region: string | undefined;
  try {
    region = new Intl.Locale(normalisedLocale).region;
  } catch {
    return null;
  }

  const currencyByRegion: Record<string, string> = {
    AU: "AUD",
    GB: "GBP",
    IE: "EUR",
    NZ: "NZD",
    US: "USD",
  };
  return region ? currencyByRegion[region] ?? null : null;
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
