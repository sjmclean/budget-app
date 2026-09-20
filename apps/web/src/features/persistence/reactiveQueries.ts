import { useMemo } from "react";
import type { AccountNavigation, FinancialOverview, SpendingCategoryRow } from "./accountRegisterQueryContracts";
import type { RegisterTransactionView } from "../accounts/accountRegisterTypes";
import type { BudgetActivityDrilldown, BudgetMonthView } from "../budget/budgetViewTypes";
import {
  createReactiveQueryDefinition,
  prefetchReactiveQuery,
  seedReactiveQuery,
  useReactiveQuery,
} from "./reactiveQueryStore";
import { getBudgetPersistenceProvider } from "./budgetPersistenceProviderFactory";

function requireQueries(provider: ReturnType<typeof getBudgetPersistenceProvider>) {
  const queries = provider.accountRegisterQueries;
  if (!queries) throw new Error("This query requires the local-first SQLite runtime.");
  return queries;
}

async function requireAnalytics(
  provider: ReturnType<typeof getBudgetPersistenceProvider>,
  budgetId: string,
) {
  const queries = requireQueries(provider);
  const status = await queries.getBudgetStatus(budgetId);
  if (!status.capabilities.analytics) {
    throw new Error("Analytics are unavailable for this SQLite budget.");
  }
  return queries;
}

export const budgetMonthQuery = createReactiveQueryDefinition<
  { readonly budgetId: string; readonly month: string },
  BudgetMonthView
>({
  id: "budget-month",
  key: ({ budgetId, month }) => `${budgetId}:${month}`,
  interest: ({ budgetId, month }) => ({
    budgetId,
    month,
    domains: ["budget", "categories", "transactions", "goals"],
  }),
  load: (provider, input) => provider.categories.getBudgetMonthView(input),
});

export const financialOverviewQuery = createReactiveQueryDefinition<
  { readonly budgetId: string; readonly month: string },
  FinancialOverview
>({
  id: "financial-overview",
  key: ({ budgetId, month }) => `${budgetId}:${month}`,
  interest: ({ budgetId }) => ({
    budgetId,
    domains: ["accounts", "transactions", "budget", "categories"],
  }),
  load: async (provider, { budgetId, month }) =>
    (await requireAnalytics(provider, budgetId)).getFinancialOverview(budgetId, month),
});

export const monthlySpendingQuery = createReactiveQueryDefinition<
  { readonly budgetId: string; readonly month: string },
  readonly SpendingCategoryRow[]
>({
  id: "monthly-spending",
  key: ({ budgetId, month }) => `${budgetId}:${month}`,
  interest: ({ budgetId, month }) => ({
    budgetId,
    month,
    domains: ["accounts", "transactions", "categories"],
  }),
  load: async (provider, { budgetId, month }) =>
    (await requireAnalytics(provider, budgetId)).getMonthlySpending(budgetId, month),
});

export const monthlyCategoryTransactionsQuery = createReactiveQueryDefinition<
  { readonly budgetId: string; readonly month: string; readonly categoryId: string },
  readonly RegisterTransactionView[]
>({
  id: "monthly-category-transactions",
  key: ({ budgetId, month, categoryId }) => `${budgetId}:${month}:${categoryId}`,
  interest: ({ budgetId, month, categoryId }) => ({
    budgetId,
    month,
    categoryId,
    domains: ["accounts", "transactions", "categories", "payees"],
  }),
  load: async (provider, { budgetId, month, categoryId }) =>
    (await requireAnalytics(provider, budgetId)).getMonthlyCategoryTransactions(
      budgetId,
      month,
      categoryId,
    ),
});

export const accountNavigationQuery = createReactiveQueryDefinition<
  { readonly budgetId: string },
  readonly AccountNavigation[]
>({
  id: "account-navigation",
  key: ({ budgetId }) => budgetId,
  interest: ({ budgetId }) => ({
    budgetId,
    domains: ["accounts", "transactions", "categories"],
  }),
  load: async (provider, { budgetId }) => requireQueries(provider).listAccountNavigation(budgetId),
});

export const categoryActivityDrilldownQuery = createReactiveQueryDefinition<
  { readonly budgetId: string; readonly month: string; readonly categoryId: string },
  BudgetActivityDrilldown
>({
  id: "category-activity-drilldown",
  key: ({ budgetId, month, categoryId }) => `${budgetId}:${month}:${categoryId}`,
  interest: ({ budgetId, month, categoryId }) => ({
    budgetId,
    month,
    categoryId,
    domains: ["accounts", "transactions", "categories", "payees"],
  }),
  load: (provider, input) => provider.categories.getCategoryActivityDrilldown(input),
});

export function useBudgetMonthQuery(
  input: { readonly budgetId: string; readonly month: string },
  enabled = true,
) {
  const provider = getBudgetPersistenceProvider();
  const { budgetId, month } = input;
  const stableInput = useMemo(
    () => ({ budgetId, month }),
    [budgetId, month],
  );
  return useReactiveQuery(budgetMonthQuery, provider, stableInput, { enabled });
}

export function useFinancialOverviewQuery(
  input: { readonly budgetId: string; readonly month: string },
  enabled = true,
) {
  const provider = getBudgetPersistenceProvider();
  const { budgetId, month } = input;
  const stableInput = useMemo(
    () => ({ budgetId, month }),
    [budgetId, month],
  );
  return useReactiveQuery(financialOverviewQuery, provider, stableInput, { enabled });
}

export function useMonthlySpendingQuery(
  input: { readonly budgetId: string; readonly month: string },
  enabled = true,
) {
  const provider = getBudgetPersistenceProvider();
  const { budgetId, month } = input;
  const stableInput = useMemo(
    () => ({ budgetId, month }),
    [budgetId, month],
  );
  return useReactiveQuery(monthlySpendingQuery, provider, stableInput, { enabled });
}

export function useMonthlyCategoryTransactionsQuery(
  input: { readonly budgetId: string; readonly month: string; readonly categoryId: string },
  enabled = true,
) {
  const provider = getBudgetPersistenceProvider();
  const { budgetId, month, categoryId } = input;
  const stableInput = useMemo(
    () => ({ budgetId, month, categoryId }),
    [budgetId, month, categoryId],
  );
  return useReactiveQuery(monthlyCategoryTransactionsQuery, provider, stableInput, { enabled });
}

export function useAccountNavigationQuery(
  input: { readonly budgetId: string },
  enabled = true,
) {
  const provider = getBudgetPersistenceProvider();
  const { budgetId } = input;
  const stableInput = useMemo(
    () => ({ budgetId }),
    [budgetId],
  );
  return useReactiveQuery(accountNavigationQuery, provider, stableInput, { enabled });
}

export function useCategoryActivityDrilldownQuery(
  input: { readonly budgetId: string; readonly month: string; readonly categoryId: string },
  enabled = true,
) {
  const provider = getBudgetPersistenceProvider();
  const { budgetId, month, categoryId } = input;
  const stableInput = useMemo(
    () => ({ budgetId, month, categoryId }),
    [budgetId, month, categoryId],
  );
  return useReactiveQuery(categoryActivityDrilldownQuery, provider, stableInput, { enabled });
}

export function prefetchBudgetMonthQuery(input: {
  readonly budgetId: string;
  readonly month: string;
}): Promise<void> {
  const provider = getBudgetPersistenceProvider();
  return prefetchReactiveQuery(budgetMonthQuery, provider, input);
}

export function seedBudgetMonthQuery(
  input: { readonly budgetId: string; readonly month: string },
  data: BudgetMonthView,
  revision: number,
): void {
  const provider = getBudgetPersistenceProvider();
  seedReactiveQuery(budgetMonthQuery, provider, input, data, revision);
}
