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
import { getActiveKeyValueStorage } from "../features/persistence/activeKeyValueStorage";
import { getBudgetPersistenceProvider } from "../features/persistence/budgetPersistenceProviderFactory";

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

createDailyVersionHistorySnapshotOnAppOpen(getActiveKeyValueStorage());

export const useBudgetRegistryStore = create<BudgetRegistryState>((set) => ({
  budgets: readBudgetRegistry(getActiveKeyValueStorage()),

  createBudget: (input) => {
    const budget = createBudgetRegistryEntry(getActiveKeyValueStorage(), input);
    set({ budgets: readBudgetRegistry(getActiveKeyValueStorage()) });
    return budget;
  },

  createBudgetWithSetup: (setup) => {
    const budget = createBudgetFromSetup(getActiveKeyValueStorage(), setup);
    set({ budgets: readBudgetRegistry(getActiveKeyValueStorage()) });
    return budget;
  },

  importYnab4Budget: async (input) => {
    const { createYnab4LauncherBudgetImportWithBackend } = await import(
      "../features/budget/ynab4LauncherImport"
    );

    await getBudgetPersistenceProvider().accountRegisterQueries
      ?.releaseLocalDatabase?.();
    createVersionHistorySnapshotBeforeBudgetImport(getActiveKeyValueStorage(), {
      now: input.now,
    });
    const result = await createYnab4LauncherBudgetImportWithBackend(getActiveKeyValueStorage(), input);
    createVersionHistorySnapshotAfterYnab4Import(getActiveKeyValueStorage(), {
      now: input.now,
    });
    set({ budgets: result.budgets });
    return result;
  },

  importActualBudget: async (input) => {
    const { createActualBudgetLauncherImportWithBackend } = await import(
      "../features/budget/actualBudgetLauncherImport"
    );

    createVersionHistorySnapshotBeforeBudgetImport(getActiveKeyValueStorage(), {
      now: input.now,
    });
    const result = await createActualBudgetLauncherImportWithBackend(getActiveKeyValueStorage(), input);
    createVersionHistorySnapshotAfterActualImport(getActiveKeyValueStorage(), {
      now: input.now,
    });
    set({ budgets: result.budgets });
    return result;
  },

  updateBudget: (budgetId, input) => {
    const budget = updateBudgetRegistryEntry(getActiveKeyValueStorage(), budgetId, input);
    set({ budgets: readBudgetRegistry(getActiveKeyValueStorage()) });
    return budget;
  },

  markBudgetOpened: (budgetId) => {
    createVersionHistorySnapshotBeforeBudgetSwitch(getActiveKeyValueStorage(), budgetId);

    const budget = markBudgetRegistryOpened(getActiveKeyValueStorage(), budgetId);
    set({ budgets: readBudgetRegistry(getActiveKeyValueStorage()) });
    return budget;
  },

  deleteBudget: (budgetId) => {
    createVersionHistorySnapshotBeforeBudgetDelete(getActiveKeyValueStorage(), budgetId);
    const result = deleteBudgetById(getActiveKeyValueStorage(), budgetId);
    set({ budgets: readBudgetRegistry(getActiveKeyValueStorage()) });
    return result;
  },

  refreshBudgets: () => {
    set({ budgets: readBudgetRegistry(getActiveKeyValueStorage()) });
  },
}));

export type { BudgetSummary };
