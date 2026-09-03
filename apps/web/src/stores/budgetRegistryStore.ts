import { create } from "zustand";
import {
  createBudgetRegistryEntry,
  markBudgetOpened as markBudgetRegistryOpened,
  readBudgetRegistry,
  updateBudgetRegistryEntry,
  type BudgetSummary,
  type CreateBudgetRegistryInput,
  type UpdateBudgetRegistryInput,
} from "../features/budget/budgetRegistry";
import type {
  CreateYnab4LauncherBudgetImportInput,
  Ynab4LauncherImportResult,
} from "../features/budget/ynab4LauncherImport";
import type {
  CreateActualBudgetLauncherImportInput,
  ActualBudgetLauncherImportResult,
} from "../features/budget/actualBudgetLauncherImport";
import { deleteBudgetById, type BudgetLifecycleResult } from "../features/budget/budgetLifecycle";
import { createLocalFirstBudgetFromSetup } from "../features/budget/newBudget/createLocalFirstBudgetFromSetup";
import type { NewBudgetSetup } from "../features/budget/newBudget/budgetTemplates";
import { getActiveKeyValueStorage } from "../features/persistence/activeKeyValueStorage";
import { runWithExclusiveBudgetDatabase } from "../features/persistence/budgetDatabaseLifecycle";

interface BudgetRegistryState {
  budgets: BudgetSummary[];
  createBudget: (input?: CreateBudgetRegistryInput) => BudgetSummary;
  createBudgetWithSetup: (setup: NewBudgetSetup) => Promise<BudgetSummary>;
  importYnab4Budget: (input: CreateYnab4LauncherBudgetImportInput) => Promise<Ynab4LauncherImportResult>;
  importActualBudget: (input: CreateActualBudgetLauncherImportInput) => Promise<ActualBudgetLauncherImportResult>;
  updateBudget: (budgetId: string, input: UpdateBudgetRegistryInput) => BudgetSummary | null;
  markBudgetOpened: (budgetId: string) => BudgetSummary | null;
  deleteBudget: (budgetId: string) => BudgetLifecycleResult;
  refreshBudgets: () => void;
}

export const useBudgetRegistryStore = create<BudgetRegistryState>((set) => ({
  budgets: readBudgetRegistry(getActiveKeyValueStorage()),

  createBudget: (input) => {
    const budget = createBudgetRegistryEntry(getActiveKeyValueStorage(), input);
    set({ budgets: readBudgetRegistry(getActiveKeyValueStorage()) });
    return budget;
  },

  createBudgetWithSetup: async (setup) => runWithExclusiveBudgetDatabase(async () => {
    const budget = await createLocalFirstBudgetFromSetup(
      getActiveKeyValueStorage(),
      setup,
    );
    set({ budgets: readBudgetRegistry(getActiveKeyValueStorage()) });
    return budget;
  }),

  importYnab4Budget: async (input) => runWithExclusiveBudgetDatabase(async () => {
    const { createYnab4LauncherBudgetImportWithBackend } = await import(
      "../features/budget/ynab4LauncherImport"
    );

    const result = await createYnab4LauncherBudgetImportWithBackend(getActiveKeyValueStorage(), input);
    set({ budgets: result.budgets });
    return result;
  }),

  importActualBudget: async (input) => runWithExclusiveBudgetDatabase(async () => {
    const { createActualBudgetLauncherImportWithBackend } = await import(
      "../features/budget/actualBudgetLauncherImport"
    );

    const result = await createActualBudgetLauncherImportWithBackend(getActiveKeyValueStorage(), input);
    set({ budgets: result.budgets });
    return result;
  }),

  updateBudget: (budgetId, input) => {
    const budget = updateBudgetRegistryEntry(getActiveKeyValueStorage(), budgetId, input);
    set({ budgets: readBudgetRegistry(getActiveKeyValueStorage()) });
    return budget;
  },

  markBudgetOpened: (budgetId) => {
    const budget = markBudgetRegistryOpened(getActiveKeyValueStorage(), budgetId);
    set({ budgets: readBudgetRegistry(getActiveKeyValueStorage()) });
    return budget;
  },

  deleteBudget: (budgetId) => {
    const result = deleteBudgetById(getActiveKeyValueStorage(), budgetId);
    set({ budgets: readBudgetRegistry(getActiveKeyValueStorage()) });
    return result;
  },

  refreshBudgets: () => {
    set({ budgets: readBudgetRegistry(getActiveKeyValueStorage()) });
  },
}));

export type { BudgetSummary };
