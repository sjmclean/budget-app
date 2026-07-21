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

export const YNAB4_LAUNCHER_IMPORT_STORAGE_PREFIX =
  "budget-app.ynab4-launcher-import.v1";

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

export interface BuildYnab4LauncherImportRecordInput {
  budget: BudgetSummary;
  discovery: Ynab4PackageDiscoveryResult;
  preview: Ynab4PackageMigrationPreview;
  persistenceWarnings: string[];
  accuracyAudit: Ynab4LauncherImportAccuracyAuditResult;
  accuracyAuditReport: string;
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

export function buildYnab4LauncherImportRecord(
  input: BuildYnab4LauncherImportRecordInput,
): Ynab4LauncherImportRecord {
  return {
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
    accuracyAudit: input.accuracyAudit,
    accuracyAuditReport: input.accuracyAuditReport,
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
