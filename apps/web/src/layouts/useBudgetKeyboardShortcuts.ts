import { useEffect } from "react";
import { useBudgetUndoRedo } from "../features/budget/budgetUndoRedo";
import { createUndoRedoKeyboardHandler } from "../features/history";

export function useBudgetKeyboardShortcuts() {
  const { undo, redo } = useBudgetUndoRedo();

  useEffect(() => {
    const handleKeyDown = createUndoRedoKeyboardHandler({
      undo: async () => {
        await undo();
      },
      redo: async () => {
        await redo();
      },
    });

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [redo, undo]);
}
