import { useBudgetMonthQuery } from "../persistence/reactiveQueries";
import type { BudgetMonthView } from "./budgetViewTypes";

interface UseBudgetViewState {
  data: BudgetMonthView | null;
  dataVersion: number;
  isLoading: boolean;
  error: string | null;
}

export function useBudgetView(
  budgetId: string,
  month: string,
  options: { readonly enabled?: boolean } = {},
): UseBudgetViewState {
  const enabled = options.enabled ?? true;
  const query = useBudgetMonthQuery({ budgetId, month }, enabled);

  return {
    data: query.data ?? null,
    dataVersion: query.dataRevision,
    isLoading: enabled && query.data === undefined &&
      (query.status === "idle" || query.status === "loading"),
    error: query.error,
  };
}
