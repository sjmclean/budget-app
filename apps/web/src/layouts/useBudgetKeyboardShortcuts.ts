import { useEffect } from "react";
import { createUndoRedoKeyboardHandler, useApplicationHistory } from "../features/history";

export function useBudgetKeyboardShortcuts() {
  const { undo, redo } = useApplicationHistory();

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
