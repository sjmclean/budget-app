import { useCallback, useSyncExternalStore } from "react";
import { useUIStore } from "../../stores/uiStore";
import {
  applicationHistory,
  type ApplicationHistoryContext,
} from "./applicationHistory";
import type { UndoableCommand, UndoRedoResult, UndoRedoSnapshot } from "./undoRedo";

export interface UseApplicationHistoryState extends UndoRedoSnapshot {
  readonly execute: (
    command: UndoableCommand<ApplicationHistoryContext>,
  ) => Promise<UndoRedoResult>;
  readonly undo: () => Promise<UndoRedoResult>;
  readonly redo: () => Promise<UndoRedoResult>;
  readonly clear: () => UndoRedoResult;
}

function requireSelectedBudgetId(budgetId: string | null): string {
  if (!budgetId) {
    throw new Error("Select a budget before using application history.");
  }
  return budgetId;
}

export function useApplicationHistory(): UseApplicationHistoryState {
  const budgetId = useUIStore((state) => state.selectedBudgetId);
  const subscribe = useCallback(
    (listener: () => void) => applicationHistory.subscribe(budgetId, listener),
    [budgetId],
  );
  const getSnapshot = useCallback(
    () => applicationHistory.getSnapshot(budgetId),
    [budgetId],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    ...snapshot,
    execute: useCallback(
      (command) => applicationHistory.execute(requireSelectedBudgetId(budgetId), command),
      [budgetId],
    ),
    undo: useCallback(
      () => applicationHistory.undo(requireSelectedBudgetId(budgetId)),
      [budgetId],
    ),
    redo: useCallback(
      () => applicationHistory.redo(requireSelectedBudgetId(budgetId)),
      [budgetId],
    ),
    clear: useCallback(
      () => applicationHistory.clear(requireSelectedBudgetId(budgetId)),
      [budgetId],
    ),
  };
}
