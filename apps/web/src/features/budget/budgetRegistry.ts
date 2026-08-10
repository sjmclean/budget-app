import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import { createRuntimeUuid } from "../ids/createRuntimeUuid";
import {
  DEFAULT_BUDGET_PREFERENCES,
  mergeBudgetPreferences,
  normaliseBudgetPreferences,
  type BudgetPreferences,
} from "./budgetPreferences";

export const BUDGET_REGISTRY_STORAGE_KEY = "budget-app.budget-registry.v1";

export interface BudgetSummary {
  id: string;
  name: string;
  currency: string;
  dateFormat?: string;
  numberFormat?: string;
  firstDayOfWeek?: string;
  preferences: BudgetPreferences;
  lastOpenedLabel: string;
  packagePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBudgetRegistryInput {
  name?: string;
  currency?: string;
  dateFormat?: string;
  numberFormat?: string;
  firstDayOfWeek?: string;
  preferences?: Partial<BudgetPreferences>;
  packagePath?: string;
  now?: Date;
}

export interface UpdateBudgetRegistryInput {
  name?: string;
  currency?: string;
  dateFormat?: string;
  numberFormat?: string;
  firstDayOfWeek?: string;
  preferences?: Partial<BudgetPreferences>;
  packagePath?: string;
  lastOpenedLabel?: string;
  now?: Date;
}

export interface HostedBudgetCatalogueEntry {
  budgetId: string;
  name: string;
  currency: string;
  role: "viewer" | "editor" | "owner";
  createdAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function createRandomBudgetId(): string {
  return `budget-${createRuntimeUuid()}`;
}

export function createUniqueBudgetId(existingIds: ReadonlySet<string>): string {
  let candidate = createRandomBudgetId();

  while (existingIds.has(candidate)) {
    candidate = createRandomBudgetId();
  }

  return candidate;
}

function getIsoTimestamp(now = new Date()): string {
  return now.toISOString();
}

function normaliseBudgetSummary(value: unknown): BudgetSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id, "");
  const name = readString(value.name, "");

  if (!id || !name) {
    return null;
  }

  const currency = readString(value.currency, "AUD").toUpperCase();
  const packagePath = readString(value.packagePath, `~/Budgets/${name.replace(/\s+/g, "")}.budget`);
  const createdAt = readString(value.createdAt, getIsoTimestamp(new Date(0)));
  const updatedAt = readString(value.updatedAt, createdAt);

  return {
    id,
    name,
    currency,
    dateFormat: readString(value.dateFormat, "DD/MM/YYYY"),
    numberFormat: readString(value.numberFormat, "1,234.56"),
    firstDayOfWeek: readString(value.firstDayOfWeek, "monday"),
    preferences: normaliseBudgetPreferences(value.preferences),
    packagePath,
    createdAt,
    updatedAt,
    lastOpenedLabel: readString(value.lastOpenedLabel, "Not opened yet"),
  };
}

export function createInitialBudgetRegistry(now = new Date()): BudgetSummary[] {
  const timestamp = getIsoTimestamp(now);

  return [
    {
      id: "household",
      name: "Household Budget",
      currency: "AUD",
      dateFormat: "DD/MM/YYYY",
      numberFormat: "1,234.56",
      firstDayOfWeek: "monday",
      preferences: { ...DEFAULT_BUDGET_PREFERENCES },
      lastOpenedLabel: "Not opened yet",
      packagePath: "~/Budgets/Household.budget",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
}

export function readBudgetRegistry(storage: KeyValueStoragePort): BudgetSummary[] {
  const raw = storage.getItem(BUDGET_REGISTRY_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    const budgets = Array.isArray(parsed)
      ? parsed.map(normaliseBudgetSummary).filter((budget): budget is BudgetSummary => Boolean(budget))
      : [];

    return budgets;
  } catch {
    return [];
  }
}

export function writeBudgetRegistry(storage: KeyValueStoragePort, budgets: BudgetSummary[]): BudgetSummary[] {
  const normalised = budgets
    .map(normaliseBudgetSummary)
    .filter((budget): budget is BudgetSummary => Boolean(budget));

  storage.setItem(BUDGET_REGISTRY_STORAGE_KEY, JSON.stringify(normalised));
  return normalised;
}

export function mergeHostedBudgetCatalogue(
  storage: KeyValueStoragePort,
  catalogue: readonly HostedBudgetCatalogueEntry[],
  now = new Date(),
): BudgetSummary[] {
  const current = readBudgetRegistry(storage);
  const byId = new Map(current.map((budget) => [budget.id, budget]));
  const timestamp = now.toISOString();
  for (const entry of catalogue) {
    if (!entry.budgetId?.trim() || byId.has(entry.budgetId)) continue;
    const name = entry.name?.trim() || entry.budgetId;
    byId.set(entry.budgetId, {
      id: entry.budgetId,
      name,
      currency: (entry.currency?.trim() || "AUD").toUpperCase(),
      dateFormat: "DD/MM/YYYY",
      numberFormat: "1,234.56",
      firstDayOfWeek: "monday",
      preferences: { ...DEFAULT_BUDGET_PREFERENCES },
      lastOpenedLabel: "Available from server",
      packagePath: `hosted://${entry.budgetId}`,
      createdAt: entry.createdAt || timestamp,
      updatedAt: timestamp,
    });
  }
  return writeBudgetRegistry(storage, [...byId.values()]);
}

export function createBudgetRegistryEntry(
  storage: KeyValueStoragePort,
  input: CreateBudgetRegistryInput = {},
): BudgetSummary {
  const budgets = readBudgetRegistry(storage);
  const name = input.name?.trim() || `New Budget ${budgets.length + 1}`;
  const currency = (input.currency?.trim() || "AUD").toUpperCase();
  const timestamp = getIsoTimestamp(input.now);
  const id = createUniqueBudgetId(new Set(budgets.map((budget) => budget.id)));
  const budget: BudgetSummary = {
    id,
    name,
    currency,
    dateFormat: input.dateFormat?.trim() || "DD/MM/YYYY",
    numberFormat: input.numberFormat?.trim() || "1,234.56",
    firstDayOfWeek: input.firstDayOfWeek?.trim() || "monday",
    preferences: mergeBudgetPreferences(undefined, input.preferences),
    lastOpenedLabel: "Not opened yet",
    packagePath: input.packagePath?.trim() || `~/Budgets/${name.replace(/\s+/g, "")}.budget`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  writeBudgetRegistry(storage, [...budgets, budget]);
  return budget;
}

export function updateBudgetRegistryEntry(
  storage: KeyValueStoragePort,
  budgetId: string,
  input: UpdateBudgetRegistryInput,
): BudgetSummary | null {
  const budgets = readBudgetRegistry(storage);
  const timestamp = getIsoTimestamp(input.now);
  let updated: BudgetSummary | null = null;

  const next = budgets.map((budget) => {
    if (budget.id !== budgetId) {
      return budget;
    }

    updated = {
      ...budget,
      name: input.name?.trim() || budget.name,
      currency: input.currency?.trim().toUpperCase() || budget.currency,
      dateFormat: input.dateFormat?.trim() || budget.dateFormat,
      numberFormat: input.numberFormat?.trim() || budget.numberFormat,
      firstDayOfWeek: input.firstDayOfWeek?.trim() || budget.firstDayOfWeek,
      preferences: mergeBudgetPreferences(budget.preferences, input.preferences),
      packagePath: input.packagePath?.trim() || budget.packagePath,
      lastOpenedLabel: input.lastOpenedLabel?.trim() || budget.lastOpenedLabel,
      updatedAt: timestamp,
    };

    return updated;
  });

  if (updated) {
    writeBudgetRegistry(storage, next);
  }

  return updated;
}

export function markBudgetOpened(
  storage: KeyValueStoragePort,
  budgetId: string,
  now = new Date(),
): BudgetSummary | null {
  return updateBudgetRegistryEntry(storage, budgetId, {
    lastOpenedLabel: "Opened just now",
    now,
  });
}

export function deleteBudgetRegistryEntry(storage: KeyValueStoragePort, budgetId: string): BudgetSummary[] {
  const budgets = readBudgetRegistry(storage).filter((budget) => budget.id !== budgetId);
  return writeBudgetRegistry(storage, budgets);
}
