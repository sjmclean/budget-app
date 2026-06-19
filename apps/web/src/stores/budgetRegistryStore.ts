import { create } from "zustand";

export interface BudgetSummary {
  id: string;
  name: string;
  currency: string;
  lastOpenedLabel: string;
  packagePath: string;
}

interface BudgetRegistryState {
  budgets: BudgetSummary[];
}

export const useBudgetRegistryStore = create<BudgetRegistryState>(() => ({
  budgets: [
    {
      id: "household",
      name: "Household Budget",
      currency: "AUD",
      lastOpenedLabel: "Demo budget",
      packagePath: "~/Budgets/Household.budget",
    },
    {
      id: "personal",
      name: "Personal Budget",
      currency: "AUD",
      lastOpenedLabel: "Demo budget",
      packagePath: "~/Budgets/Personal.budget",
    },
    {
      id: "business",
      name: "Business Budget",
      currency: "AUD",
      lastOpenedLabel: "Demo budget",
      packagePath: "~/Budgets/Business.budget",
    },
  ],
}));
