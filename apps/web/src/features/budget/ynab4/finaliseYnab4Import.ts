import {
  markBudgetOpened,
  readBudgetRegistry,
  type BudgetSummary,
} from "../budgetRegistry";
import { SELECTED_BUDGET_STORAGE_KEY } from "../budgetDataScope";
import type { KeyValueStoragePort } from "../../persistence/keyValueStoragePort";
import type {
  Ynab4PackageDiscoveryResult,
  Ynab4PackageMigrationPreview,
} from "../../../../../../packages/ynab4-importer/src/analyzeYnab4Package";
import type { Ynab4LauncherImportAccuracyAuditResult } from "../ynab4LauncherImportAccuracyAudit";
interface Ynab4PersistedStreamingAudit {
  status: "pass";
  transactions: number;
  totalInflow: number;
  totalOutflow: number;
}

interface Ynab4PersistedStreamingProgress {
  phase:
    | "preflight"
    | "reference-data"
    | "transactions"
    | "scheduled"
    | "finalising"
    | "committing";
  sourceRecordsConsumed: number;
  persistedTransactions: number;
  batchesPersisted: number;
}

export const YNAB4_LAUNCHER_IMPORT_STORAGE_PREFIX =
  "budget-app.ynab4-launcher-import.v1";

export interface Ynab4LauncherImportRecord {
  schemaVersion?: 1 | 2;
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
  streamingImport?: {
    batchSize: number;
    sourceRecordsConsumed: number;
    persistedTransactions: number;
    batchesPersisted: number;
    maximumCanonicalBatchRecords: number;
    audit: Ynab4PersistedStreamingAudit;
  };
}

export interface BuildYnab4LauncherImportRecordInput {
  budget: BudgetSummary;
  discovery: Ynab4PackageDiscoveryResult;
  preview: Ynab4PackageMigrationPreview;
  persistenceWarnings: string[];
  accuracyAudit?: Ynab4LauncherImportAccuracyAuditResult;
  accuracyAuditReport?: string;
  streamingImport?: {
    batchSize: number;
    progress: Ynab4PersistedStreamingProgress;
    maximumCanonicalBatchRecords: number;
    audit: Ynab4PersistedStreamingAudit;
  };
  now: Date;
}

export interface CommitYnab4LauncherImportResult {
  budget: BudgetSummary;
  record: Ynab4LauncherImportRecord;
  budgets: BudgetSummary[];
}

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

export function isLargeStreamingYnab4Budget(
  storage: KeyValueStoragePort,
  budgetId: string | null,
  transactionLimit = 25_000,
): boolean {
  if (!budgetId) return false;
  const record = readYnab4LauncherImportRecord(storage, budgetId);
  return Boolean(
    record?.schemaVersion === 2 &&
    record.streamingImport &&
    record.counts.transactions > transactionLimit,
  );
}

export function buildYnab4LauncherImportRecord(
  input: BuildYnab4LauncherImportRecordInput,
): Ynab4LauncherImportRecord {
  return {
    schemaVersion: input.streamingImport ? 2 : 1,
    budgetId: input.budget.id,
    budgetName: input.budget.name,
    sourceBudgetName: input.preview.budgetName,
    sourcePackageRoot: input.discovery.packageRoot,
    sourceDataPath: input.discovery.budgetDataPath,
    mode: "new-budget",
    status: "completed",
    importedAt: input.now.toISOString(),
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
    warnings: [...input.preview.warnings, ...input.persistenceWarnings],
    progressSteps: input.preview.progressSteps.map((step) => ({
      phase: step.phase,
      label: step.label,
      detail: step.detail,
    })),
    ...(input.accuracyAudit
      ? { accuracyAudit: input.accuracyAudit }
      : {}),
    ...(input.accuracyAuditReport
      ? { accuracyAuditReport: input.accuracyAuditReport }
      : {}),
    ...(input.streamingImport
      ? { streamingImport: {
          batchSize: input.streamingImport.batchSize,
          sourceRecordsConsumed:
            input.streamingImport.progress.sourceRecordsConsumed,
          persistedTransactions:
            input.streamingImport.progress.persistedTransactions,
          batchesPersisted: input.streamingImport.progress.batchesPersisted,
          maximumCanonicalBatchRecords:
            input.streamingImport.maximumCanonicalBatchRecords,
          audit: input.streamingImport.audit,
        } }
      : {}),
  };
}

export function commitYnab4LauncherImport(
  storage: KeyValueStoragePort,
  input: BuildYnab4LauncherImportRecordInput,
): CommitYnab4LauncherImportResult {
  markBudgetOpened(storage, input.budget.id, input.now);
  storage.setItem(SELECTED_BUDGET_STORAGE_KEY, input.budget.id);

  const record = buildYnab4LauncherImportRecord(input);

  storage.setItem(
    getYnab4LauncherImportStorageKey(input.budget.id),
    JSON.stringify(record),
  );

  const openedBudget = markBudgetOpened(storage, input.budget.id, input.now) ?? input.budget;

  return {
    budget: openedBudget,
    record,
    budgets: readBudgetRegistry(storage),
  };
}
