import { create } from "zustand";
import {
  createBudgetRegistryEntry,
  deleteBudgetRegistryEntry,
  markBudgetOpened as markBudgetRegistryOpened,
  readBudgetRegistry,
  updateBudgetRegistryEntry,
  type BudgetSummary,
  type CreateBudgetRegistryInput,
  type UpdateBudgetRegistryInput,
} from "../features/budget/budgetRegistry";
import { createYnab4LauncherBudgetImportWithBackend, type CreateYnab4LauncherBudgetImportInput, type Ynab4LauncherImportResult } from "../features/budget/ynab4LauncherImport";
import { browserLocalStorageKeyValueStorage } from "../features/persistence/keyValueStoragePort";

interface BudgetRegistryState {
  budgets: BudgetSummary[];
  createBudget: (input?: CreateBudgetRegistryInput) => BudgetSummary;
  importYnab4Budget: (input: CreateYnab4LauncherBudgetImportInput) => Promise<Ynab4LauncherImportResult>;
  updateBudget: (budgetId: string, input: UpdateBudgetRegistryInput) => BudgetSummary | null;
  markBudgetOpened: (budgetId: string) => BudgetSummary | null;
  deleteBudget: (budgetId: string) => void;
  refreshBudgets: () => void;
}

export const useBudgetRegistryStore = create<BudgetRegistryState>((set) => ({
  budgets: readBudgetRegistry(browserLocalStorageKeyValueStorage),

  createBudget: (input) => {
    const budget = createBudgetRegistryEntry(browserLocalStorageKeyValueStorage, input);
    set({ budgets: readBudgetRegistry(browserLocalStorageKeyValueStorage) });
    return budget;
  },

  importYnab4Budget: async (input) => {
    const result = await createYnab4LauncherBudgetImportWithBackend(browserLocalStorageKeyValueStorage, input);
    set({ budgets: result.budgets });
    return result;
  },

  updateBudget: (budgetId, input) => {
    const budget = updateBudgetRegistryEntry(browserLocalStorageKeyValueStorage, budgetId, input);
    set({ budgets: readBudgetRegistry(browserLocalStorageKeyValueStorage) });
    return budget;
  },

  markBudgetOpened: (budgetId) => {
    const budget = markBudgetRegistryOpened(browserLocalStorageKeyValueStorage, budgetId);
    set({ budgets: readBudgetRegistry(browserLocalStorageKeyValueStorage) });
    return budget;
  },

  deleteBudget: (budgetId) => {
    const budgets = deleteBudgetRegistryEntry(browserLocalStorageKeyValueStorage, budgetId);
    set({ budgets });
  },

  refreshBudgets: () => {
    set({ budgets: readBudgetRegistry(browserLocalStorageKeyValueStorage) });
  },
}));

export type { BudgetSummary };
