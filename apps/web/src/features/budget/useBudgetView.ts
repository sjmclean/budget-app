import { useEffect, useState } from "react";
import { getBudgetPersistenceProvider } from "../persistence";
import { usePersistenceChangeVersion } from "../persistence/persistenceChangeBus";
import type { BudgetMonthView } from "./budgetViewTypes";

interface UseBudgetViewState {
  data: BudgetMonthView | null;
  isLoading: boolean;
  error: string | null;
}

export function useBudgetView(
  budgetId: string,
  month: string,
  options: { readonly enabled?: boolean } = {},
): UseBudgetViewState {
  const enabled = options.enabled ?? true;
  const categoriesPersistence = getBudgetPersistenceProvider().categories;
  const persistenceChangeVersion = usePersistenceChangeVersion();
  const [state, setState] = useState<UseBudgetViewState>({
    data: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;

    if (!enabled) {
      setState({ data: null, isLoading: false, error: null });
      return () => {
        isMounted = false;
      };
    }

    async function loadBudgetView() {
      setState((current) => ({
        data: current.data,
        isLoading: current.data === null,
        error: null,
      }));

      try {
        const data = await categoriesPersistence.getBudgetMonthView({
          budgetId,
          month,
        });

        if (!isMounted) {
          return;
        }

        setState({
          data,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setState({
          data: null,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to load budget view.",
        });
      }
    }

    void loadBudgetView();

    return () => {
      isMounted = false;
    };
  }, [budgetId, categoriesPersistence, enabled, month, persistenceChangeVersion]);

  return state;
}
