import { useEffect, useState } from "react";
import { mockBudgetViewService } from "./mockBudgetViewService";
import type { BudgetMonthView } from "./budgetViewTypes";

interface UseBudgetViewState {
  data: BudgetMonthView | null;
  isLoading: boolean;
  error: string | null;
}

export function useBudgetView(budgetId: string, month: string): UseBudgetViewState {
  const [state, setState] = useState<UseBudgetViewState>({
    data: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadBudgetView() {
      setState({
        data: null,
        isLoading: true,
        error: null,
      });

      try {
        const data = await mockBudgetViewService.getBudgetMonthView({
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
  }, [budgetId, month]);

  return state;
}
