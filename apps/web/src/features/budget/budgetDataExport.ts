import { resolveActiveBudget } from "./activeBudget";
import {
  BUDGET_REGISTRY_STORAGE_KEY,
  readBudgetRegistry,
  type BudgetSummary,
} from "./budgetRegistry";
import {
  getBudgetScopedStorageKey,
  SELECTED_BUDGET_STORAGE_KEY,
} from "./budgetDataScope";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import { SETTINGS_STORAGE_KEY } from "../settings/settingsPreferences";

export const BUDGET_DATA_EXPORT_SCHEMA = "budget-app.data-export.v1";
export const BUDGET_DATA_EXPORT_RELEASE = "v1.49";

export type BudgetDataExportKind = "export" | "backup";

export interface BudgetDataStorageRecord {
  key: string;
  value: string;
  scope: "budget" | "global";
  description: string;
}

export interface BudgetDataSummaryCounts {
  accounts: number;
  accountRegisters: number;
  transactions: number;
  payees: number;
  scheduledTransactions: number;
  budgetMonths: number;
  storageRecords: number;
}

export interface BudgetDataExportPackage {
  schema: typeof BUDGET_DATA_EXPORT_SCHEMA;
  release: typeof BUDGET_DATA_EXPORT_RELEASE;
  kind: BudgetDataExportKind;
  exportedAt: string;
  budget: BudgetSummary;
  counts: BudgetDataSummaryCounts;
  records: BudgetDataStorageRecord[];
  notes: string[];
}

export interface BudgetDataRestorePreview {
  valid: boolean;
  schema?: string;
  release?: string;
  kind?: string;
  budgetName?: string;
  budgetId?: string;
  exportedAt?: string;
  counts?: BudgetDataSummaryCounts;
  warnings: string[];
  errors: string[];
}

const ACCOUNT_STORAGE_KEY = "budget-app.accounts.v1";
const ACCOUNT_REGISTER_STORAGE_KEY = "budget-app.account-registers.v1";
const PAYEE_STORAGE_KEY = "budget-app.payees.v1";
const SCHEDULED_TRANSACTION_STORAGE_KEY = "budget-app.scheduled-transactions.v1";
const BUDGET_VIEW_STORAGE_PREFIX = "budget-app.budget-view.v1";

const budgetScopedLogicalKeys = [
  {
    key: ACCOUNT_STORAGE_KEY,
    description: "Accounts",
  },
  {
    key: ACCOUNT_REGISTER_STORAGE_KEY,
    description: "Account registers and transactions",
  },
  {
    key: PAYEE_STORAGE_KEY,
    description: "Payees",
  },
  {
    key: SCHEDULED_TRANSACTION_STORAGE_KEY,
    description: "Scheduled transactions",
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(value: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function countArray(value: string | null): number {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed.length : 0;
}

function countRegisterRecords(value: string | null): { accountRegisters: number; transactions: number } {
  const parsed = parseJson(value);

  if (!isRecord(parsed)) {
    return { accountRegisters: 0, transactions: 0 };
  }

  let accountRegisters = 0;
  let transactions = 0;

  for (const register of Object.values(parsed)) {
    if (!isRecord(register)) {
      continue;
    }

    accountRegisters += 1;
    const registerTransactions = register.transactions;
    if (Array.isArray(registerTransactions)) {
      transactions += registerTransactions.length;
    }
  }

  return { accountRegisters, transactions };
}

function listStorageKeys(storage: KeyValueStoragePort): string[] {
  return typeof storage.listKeys === "function" ? storage.listKeys() : [];
}

function readBudgetScopedValue(storage: KeyValueStoragePort, budgetId: string, logicalKey: string): string | null {
  const scopedKey = getBudgetScopedStorageKey(budgetId, logicalKey);
  const scopedValue = storage.getItem(scopedKey);

  if (scopedValue !== null) {
    return scopedValue;
  }

  // v1.48 kept the original starter budget readable from legacy global keys.
  // Include that bridge in exports so existing household data is protected.
  if (budgetId === "household") {
    return storage.getItem(logicalKey);
  }

  return null;
}

export function createBudgetDataExportPackage(
  storage: KeyValueStoragePort,
  kind: BudgetDataExportKind,
  now = new Date(),
): BudgetDataExportPackage {
  const budgets = readBudgetRegistry(storage);
  const selectedBudgetId = storage.getItem(SELECTED_BUDGET_STORAGE_KEY)?.trim() || null;
  const activeBudget = resolveActiveBudget(budgets, selectedBudgetId);

  if (!activeBudget) {
    throw new Error("No active budget is available to export.");
  }

  const records: BudgetDataStorageRecord[] = [];

  for (const item of budgetScopedLogicalKeys) {
    const value = readBudgetScopedValue(storage, activeBudget.id, item.key);

    if (value !== null) {
      records.push({
        key: getBudgetScopedStorageKey(activeBudget.id, item.key),
        value,
        scope: "budget",
        description: item.description,
      });
    }
  }

  const budgetViewPrefix = `${BUDGET_VIEW_STORAGE_PREFIX}.${activeBudget.id}.`;
  for (const key of listStorageKeys(storage).filter((key) => key.startsWith(budgetViewPrefix)).sort()) {
    const value = storage.getItem(key);

    if (value !== null) {
      records.push({
        key,
        value,
        scope: "budget",
        description: "Budget month view",
      });
    }
  }

  const settings = storage.getItem(SETTINGS_STORAGE_KEY);
  if (settings !== null) {
    records.push({
      key: SETTINGS_STORAGE_KEY,
      value: settings,
      scope: "global",
      description: "Current settings preferences snapshot",
    });
  }

  const registry = storage.getItem(BUDGET_REGISTRY_STORAGE_KEY);
  if (registry !== null) {
    records.push({
      key: BUDGET_REGISTRY_STORAGE_KEY,
      value: registry,
      scope: "global",
      description: "Budget registry snapshot",
    });
  }

  const accountRecord = records.find((record) => record.key.endsWith(ACCOUNT_STORAGE_KEY));
  const registerRecord = records.find((record) => record.key.endsWith(ACCOUNT_REGISTER_STORAGE_KEY));
  const payeeRecord = records.find((record) => record.key.endsWith(PAYEE_STORAGE_KEY));
  const scheduledRecord = records.find((record) => record.key.endsWith(SCHEDULED_TRANSACTION_STORAGE_KEY));
  const registerCounts = countRegisterRecords(registerRecord?.value ?? null);

  return {
    schema: BUDGET_DATA_EXPORT_SCHEMA,
    release: BUDGET_DATA_EXPORT_RELEASE,
    kind,
    exportedAt: now.toISOString(),
    budget: activeBudget,
    counts: {
      accounts: countArray(accountRecord?.value ?? null),
      accountRegisters: registerCounts.accountRegisters,
      transactions: registerCounts.transactions,
      payees: countArray(payeeRecord?.value ?? null),
      scheduledTransactions: countArray(scheduledRecord?.value ?? null),
      budgetMonths: records.filter((record) => record.key.startsWith(budgetViewPrefix)).length,
      storageRecords: records.length,
    },
    records,
    notes: [
      "v1.49 creates a portable JSON package for the active budget only.",
      "Restore is preview-only in v1.49; no existing app data is overwritten by the restore preview workflow.",
      "Global settings and registry records are included as snapshots so future restore work can validate context.",
    ],
  };
}

export function serialiseBudgetDataPackage(pkg: BudgetDataExportPackage): string {
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

export function createBudgetDataFilename(pkg: BudgetDataExportPackage): string {
  const safeName = pkg.budget.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "budget";
  const date = pkg.exportedAt.slice(0, 10);
  const suffix = pkg.kind === "backup" ? "backup" : "export";

  return `${safeName}-${date}.${suffix}.json`;
}

export function previewBudgetDataRestore(raw: string): BudgetDataRestorePreview {
  const errors: string[] = [];
  const warnings: string[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      valid: false,
      warnings,
      errors: ["File is not valid JSON."],
    };
  }

  if (!isRecord(parsed)) {
    return {
      valid: false,
      warnings,
      errors: ["File does not contain a budget data package."],
    };
  }

  const schema = typeof parsed.schema === "string" ? parsed.schema : undefined;
  const release = typeof parsed.release === "string" ? parsed.release : undefined;
  const kind = typeof parsed.kind === "string" ? parsed.kind : undefined;
  const exportedAt = typeof parsed.exportedAt === "string" ? parsed.exportedAt : undefined;
  const budget = isRecord(parsed.budget) ? parsed.budget : null;
  const counts = isRecord(parsed.counts) ? parsed.counts : null;
  const records = Array.isArray(parsed.records) ? parsed.records : null;

  if (schema !== BUDGET_DATA_EXPORT_SCHEMA) {
    errors.push("Unsupported or missing export schema.");
  }

  if (!budget) {
    errors.push("Missing budget summary.");
  }

  if (!records) {
    errors.push("Missing storage records.");
  }

  if (kind !== "export" && kind !== "backup") {
    warnings.push("Package kind is not recognised as an export or backup.");
  }

  if (records && records.length === 0) {
    warnings.push("Package contains no storage records.");
  }

  if (release && release !== BUDGET_DATA_EXPORT_RELEASE) {
    warnings.push(`Package was created by ${release}; current restore preview is ${BUDGET_DATA_EXPORT_RELEASE}.`);
  }

  return {
    valid: errors.length === 0,
    schema,
    release,
    kind,
    budgetName: typeof budget?.name === "string" ? budget.name : undefined,
    budgetId: typeof budget?.id === "string" ? budget.id : undefined,
    exportedAt,
    counts: counts
      ? {
          accounts: Number(counts.accounts) || 0,
          accountRegisters: Number(counts.accountRegisters) || 0,
          transactions: Number(counts.transactions) || 0,
          payees: Number(counts.payees) || 0,
          scheduledTransactions: Number(counts.scheduledTransactions) || 0,
          budgetMonths: Number(counts.budgetMonths) || 0,
          storageRecords: Number(counts.storageRecords) || records?.length || 0,
        }
      : undefined,
    warnings,
    errors,
  };
}
