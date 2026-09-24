import { useCallback, useMemo, useSyncExternalStore } from "react";
import { applicationHistory } from "../history";
import type { BudgetMoneyMovementHistoryEntry } from "./budgetMoneyMovement";
import { deriveBudgetMoneyMovementHistory } from "./budgetMoneyMovementHistory";

export function useBudgetMoneyMovementHistory(
  budgetId: string | null | undefined,
  currencyCode: string | null | undefined,
): readonly BudgetMoneyMovementHistoryEntry[] {
  const subscribe = useCallback(
    (listener: () => void) => applicationHistory.subscribe(budgetId, listener),
    [budgetId],
  );
  const getSnapshot = useCallback(
    () => applicationHistory.getEffectiveHistoryEntries(budgetId),
    [budgetId],
  );
  const entries = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(
    () => deriveBudgetMoneyMovementHistory(entries, currencyCode),
    [entries, currencyCode],
  );
}
