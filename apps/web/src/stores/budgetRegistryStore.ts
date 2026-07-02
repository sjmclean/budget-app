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
import { createYnab4LauncherBudgetImportWithBackend, type CreateYnab4LauncherBudgetImportInput, type Ynab4LauncherImportResult } from "../features/budget/ynab4LauncherImport";
import { createActualBudgetLauncherImportWithBackend, type CreateActualBudgetLauncherImportInput, type ActualBudgetLauncherImportResult } from "../features/budget/actualBudgetLauncherImport";
import {
  createDailyVersionHistorySnapshotOnAppOpen,
  createVersionHistorySnapshotAfterActualImport,
  createVersionHistorySnapshotAfterYnab4Import,
  createVersionHistorySnapshotBeforeBudgetDelete,
  createVersionHistorySnapshotBeforeBudgetImport,
  createVersionHistorySnapshotBeforeBudgetSwitch,
} from "../features/budget/versionHistoryLifecycle";
import { deleteBudgetById, type BudgetLifecycleResult } from "../features/budget/budgetLifecycle";
import { createBudgetFromSetup } from "../features/budget/newBudget/createBudgetFromSetup";
import type { NewBudgetSetup } from "../features/budget/newBudget/budgetTemplates";
import { browserLocalStorageKeyValueStorage } from "../features/persistence/keyValueStoragePort";

interface BudgetRegistryState {
  budgets: BudgetSummary[];
  createBudget: (input?: CreateBudgetRegistryInput) => BudgetSummary;
  createBudgetWithSetup: (setup: NewBudgetSetup) => BudgetSummary;
  importYnab4Budget: (input: CreateYnab4LauncherBudgetImportInput) => Promise<Ynab4LauncherImportResult>;
  importActualBudget: (input: CreateActualBudgetLauncherImportInput) => Promise<ActualBudgetLauncherImportResult>;
  updateBudget: (budgetId: string, input: UpdateBudgetRegistryInput) => BudgetSummary | null;
  markBudgetOpened: (budgetId: string) => BudgetSummary | null;
  deleteBudget: (budgetId: string) => BudgetLifecycleResult;
  refreshBudgets: () => void;
}

createDailyVersionHistorySnapshotOnAppOpen(browserLocalStorageKeyValueStorage);

export const useBudgetRegistryStore = create<BudgetRegistryState>((set) => ({
  budgets: readBudgetRegistry(browserLocalStorageKeyValueStorage),

  createBudget: (input) => {
    const budget = createBudgetRegistryEntry(browserLocalStorageKeyValueStorage, input);
    set({ budgets: readBudgetRegistry(browserLocalStorageKeyValueStorage) });
    return budget;
  },

  createBudgetWithSetup: (setup) => {
    const budget = createBudgetFromSetup(browserLocalStorageKeyValueStorage, setup);
    set({ budgets: readBudgetRegistry(browserLocalStorageKeyValueStorage) });
    return budget;
  },

  importYnab4Budget: async (input) => {
    createVersionHistorySnapshotBeforeBudgetImport(browserLocalStorageKeyValueStorage, {
      now: input.now,
    });
    const result = await createYnab4LauncherBudgetImportWithBackend(browserLocalStorageKeyValueStorage, input);
    createVersionHistorySnapshotAfterYnab4Import(browserLocalStorageKeyValueStorage, {
      now: input.now,
    });
    set({ budgets: result.budgets });
    return result;
  },

  importActualBudget: async (input) => {
    createVersionHistorySnapshotBeforeBudgetImport(browserLocalStorageKeyValueStorage, {
      now: input.now,
    });
    const result = await createActualBudgetLauncherImportWithBackend(browserLocalStorageKeyValueStorage, input);
    createVersionHistorySnapshotAfterActualImport(browserLocalStorageKeyValueStorage, {
      now: input.now,
    });
    set({ budgets: result.budgets });
    return result;
  },

  updateBudget: (budgetId, input) => {
    const budget = updateBudgetRegistryEntry(browserLocalStorageKeyValueStorage, budgetId, input);
    set({ budgets: readBudgetRegistry(browserLocalStorageKeyValueStorage) });
    return budget;
  },

  markBudgetOpened: (budgetId) => {
    createVersionHistorySnapshotBeforeBudgetSwitch(browserLocalStorageKeyValueStorage, budgetId);

    const budget = markBudgetRegistryOpened(browserLocalStorageKeyValueStorage, budgetId);
    set({ budgets: readBudgetRegistry(browserLocalStorageKeyValueStorage) });
    return budget;
  },

  deleteBudget: (budgetId) => {
    createVersionHistorySnapshotBeforeBudgetDelete(browserLocalStorageKeyValueStorage, budgetId);
    const result = deleteBudgetById(browserLocalStorageKeyValueStorage, budgetId);
    set({ budgets: readBudgetRegistry(browserLocalStorageKeyValueStorage) });
    return result;
  },

  refreshBudgets: () => {
    set({ budgets: readBudgetRegistry(browserLocalStorageKeyValueStorage) });
  },
}));

export type { BudgetSummary };
