import { useCallback, useMemo, useSyncExternalStore } from "react";
import { applicationHistory } from "../history";
import {
  isBudgetMoneyMovementHistoryEntry,
  type BudgetMoneyMovementHistoryEntry,
} from "./budgetMoneyMovement";

export function useBudgetMoneyMovementHistory(
  budgetId: string | null | undefined,
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
    () => entries.filter(isBudgetMoneyMovementHistoryEntry),
    [entries],
  );
}
