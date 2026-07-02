import { resolveActiveBudget } from "./activeBudget";
import {
  deleteBudgetRegistryEntry,
  readBudgetRegistry,
  type BudgetSummary,
} from "./budgetRegistry";
import {
  getBudgetScopedStorageKey,
  SELECTED_BUDGET_STORAGE_KEY,
} from "./budgetDataScope";
import { cloneDefaultCategoryTemplate } from "./defaultCategoryTemplate";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";

const ACCOUNT_STORAGE_KEY = "budget-app.accounts.v1";
const ACCOUNT_REGISTER_STORAGE_KEY = "budget-app.account-registers.v1";
const PAYEE_STORAGE_KEY = "budget-app.payees.v1";
const SCHEDULED_TRANSACTION_STORAGE_KEY = "budget-app.scheduled-transactions.v1";
const BUDGET_VIEW_STORAGE_PREFIX = "budget-app.budget-view.v1";

const budgetScopedLogicalKeys = [
  ACCOUNT_STORAGE_KEY,
  ACCOUNT_REGISTER_STORAGE_KEY,
  PAYEE_STORAGE_KEY,
  SCHEDULED_TRANSACTION_STORAGE_KEY,
];

export interface BudgetLifecycleResult {
  completed: boolean;
  budgetId?: string;
  budgetName?: string;
  removedRecords: number;
  writtenRecords: number;
  remainingBudgets: number;
  warnings: string[];
  errors: string[];
}

function listStorageKeys(storage: KeyValueStoragePort): string[] {
  return typeof storage.listKeys === "function" ? storage.listKeys() : [];
}

function getIsoMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

function monthLabelFromIsoMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);

  if (!year || !monthNumber) {
    return month;
  }

  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthNumber - 1, 1));
}

function resolveCurrentBudget(storage: KeyValueStoragePort): BudgetSummary | null {
  const budgets = readBudgetRegistry(storage);
  const selectedBudgetId = storage.getItem(SELECTED_BUDGET_STORAGE_KEY)?.trim() || null;
  return resolveActiveBudget(budgets, selectedBudgetId);
}

export function collectBudgetScopedStorageKeys(storage: KeyValueStoragePort, budgetId: string): string[] {
  const keysToRemove = new Set<string>();

  for (const logicalKey of budgetScopedLogicalKeys) {
    keysToRemove.add(getBudgetScopedStorageKey(budgetId, logicalKey));
  }

  // v1.48 kept a legacy bridge for the original starter budget. Lifecycle
  // operations must clean both the scoped and old global records for that budget.
  if (budgetId === "household") {
    for (const logicalKey of budgetScopedLogicalKeys) {
      keysToRemove.add(logicalKey);
    }
  }

  const budgetViewPrefix = `${BUDGET_VIEW_STORAGE_PREFIX}.${budgetId}.`;
  for (const key of listStorageKeys(storage)) {
    if (key.startsWith(budgetViewPrefix)) {
      keysToRemove.add(key);
    }
  }

  return [...keysToRemove].sort();
}

function removeBudgetScopedRecords(storage: KeyValueStoragePort, budgetId: string): number {
  const keys = collectBudgetScopedStorageKeys(storage, budgetId);

  for (const key of keys) {
    storage.removeItem(key);
  }

  return keys.length;
}

function createStarterBudgetMonthValue(budget: BudgetSummary, month: string): string {
  const categoryGroups = cloneDefaultCategoryTemplate().map((group) => ({
    id: group.id,
    name: group.name,
    previousAvailable: 0,
    assigned: 0,
    activity: 0,
    available: 0,
    categories: group.categories.map((category) => ({
      id: category.id,
      name: category.name,
      previousAvailable: 0,
      assigned: 0,
      activity: 0,
      available: 0,
      isOverspent: false,
      isArchived: false,
    })),
  }));

  return JSON.stringify({
    budgetId: budget.id,
    budgetName: budget.name,
    monthLabel: monthLabelFromIsoMonth(month),
    currencyCode: budget.currency,
    readyToAssign: 0,
    totalAssigned: 0,
    totalActivity: 0,
    totalAvailable: 0,
    categoryGroups,
  });
}

function writeStarterBudgetMonth(storage: KeyValueStoragePort, budget: BudgetSummary, now = new Date()): string {
  const month = getIsoMonth(now);
  const key = `${BUDGET_VIEW_STORAGE_PREFIX}.${budget.id}.${month}`;
  storage.setItem(key, createStarterBudgetMonthValue(budget, month));
  return key;
}

export function resetCurrentBudget(storage: KeyValueStoragePort, now = new Date()): BudgetLifecycleResult {
  const activeBudget = resolveCurrentBudget(storage);

  if (!activeBudget) {
    return {
      completed: false,
      removedRecords: 0,
      writtenRecords: 0,
      remainingBudgets: 0,
      warnings: [],
      errors: ["No active budget is available to reset."],
    };
  }

  const removedRecords = removeBudgetScopedRecords(storage, activeBudget.id);
  writeStarterBudgetMonth(storage, activeBudget, now);

  return {
    completed: true,
    budgetId: activeBudget.id,
    budgetName: activeBudget.name,
    removedRecords,
    writtenRecords: 1,
    remainingBudgets: readBudgetRegistry(storage).length,
    warnings: [
      "Budget settings and registry entry were preserved.",
      "Default starter categories were reapplied for the current month.",
    ],
    errors: [],
  };
}

export function deleteBudgetById(storage: KeyValueStoragePort, budgetId: string): BudgetLifecycleResult {
  const budgetToDelete = readBudgetRegistry(storage).find((budget) => budget.id === budgetId) ?? null;

  if (!budgetToDelete) {
    return {
      completed: false,
      removedRecords: 0,
      writtenRecords: 0,
      remainingBudgets: readBudgetRegistry(storage).length,
      warnings: [],
      errors: ["The selected budget could not be found."],
    };
  }

  const removedRecords = removeBudgetScopedRecords(storage, budgetToDelete.id);
  const remainingBudgets = deleteBudgetRegistryEntry(storage, budgetToDelete.id);
  const selectedBudgetId = storage.getItem(SELECTED_BUDGET_STORAGE_KEY)?.trim() || null;

  if (selectedBudgetId === budgetToDelete.id) {
    storage.removeItem(SELECTED_BUDGET_STORAGE_KEY);
  }

  return {
    completed: true,
    budgetId: budgetToDelete.id,
    budgetName: budgetToDelete.name,
    removedRecords,
    writtenRecords: 0,
    remainingBudgets: remainingBudgets.length,
    warnings: remainingBudgets.length === 0 ? ["No budgets remain. The budget selector will show the first-run state."] : [],
    errors: [],
  };
}

export function deleteCurrentBudget(storage: KeyValueStoragePort): BudgetLifecycleResult {
  const activeBudget = resolveCurrentBudget(storage);

  if (!activeBudget) {
    return {
      completed: false,
      removedRecords: 0,
      writtenRecords: 0,
      remainingBudgets: readBudgetRegistry(storage).length,
      warnings: [],
      errors: ["No active budget is available to delete."],
    };
  }

  return deleteBudgetById(storage, activeBudget.id);
}
