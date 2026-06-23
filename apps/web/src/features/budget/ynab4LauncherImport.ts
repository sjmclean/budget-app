import {
  createBudgetRegistryEntry,
  markBudgetOpened,
  readBudgetRegistry,
  type BudgetSummary,
} from "./budgetRegistry";
import { SELECTED_BUDGET_STORAGE_KEY } from "./budgetDataScope";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import type {
  Ynab4PackageDiscoveryResult,
  Ynab4PackageMigrationPreview,
} from "../../../../../packages/ynab4-importer/src/analyzeYnab4Package";

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
}

export interface CreateYnab4LauncherBudgetImportInput {
  discovery: Ynab4PackageDiscoveryResult;
  preview: Ynab4PackageMigrationPreview;
  now?: Date;
}

export interface Ynab4LauncherImportResult {
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

  const now = input.now ?? new Date();
  const budgetName = createImportedBudgetName(input.preview.budgetName);
  const budget = createBudgetRegistryEntry(storage, {
    name: budgetName,
    currency: "AUD",
    packagePath: input.discovery.packageRoot
      ? `${input.discovery.packageRoot}.budget`
      : undefined,
    now,
  });

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
    warnings: [...input.preview.warnings],
    progressSteps: input.preview.progressSteps.map((step) => ({
      phase: step.phase,
      label: step.label,
      detail: step.detail,
    })),
  };

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
}

export function createImportedBudgetName(sourceName: string | null): string {
  const baseName = sourceName?.trim() || "YNAB4 Budget";
  return `${baseName} Imported`;
}
