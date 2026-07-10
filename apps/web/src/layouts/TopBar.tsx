import { useEffect } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { resolveActiveBudget } from "../features/budget/activeBudget";
import { useBudgetUndoRedo } from "../features/budget/budgetUndoRedo";
import { createUndoRedoKeyboardHandler } from "../features/history";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore, type ThemeMode } from "../stores/uiStore";

export function TopBar() {
  const navigate = useNavigate();
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  const selectedBudgetId = useUIStore((state) => state.selectedBudgetId);
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const activeBudget = resolveActiveBudget(budgets, selectedBudgetId);
  const {
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    isBusy,
    undo,
    redo,
  } = useBudgetUndoRedo();

  useEffect(() => {
    const handleKeyDown = createUndoRedoKeyboardHandler({ undo, redo });
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [redo, undo]);

  const undoTitle = canUndo && undoLabel
    ? `Undo ${undoLabel} (Ctrl/Cmd+Z)`
    : "Nothing to undo";
  const redoTitle = canRedo && redoLabel
    ? `Redo ${redoLabel} (Ctrl+Shift+Z or Ctrl+Y)`
    : "Nothing to redo";

  return (
    <header className="topbar">
      <div>
        <h1 className="topbar-title">
          {activeBudget?.name ?? "Budget App"}
        </h1>
        <p className="topbar-subtitle">Local-first envelope budgeting</p>
      </div>

      <div className="topbar-controls">
        <Button type="button" variant="secondary" onClick={() => navigate("/")}>
          Switch budget
        </Button>

        <div className="topbar-history-controls" aria-label="Undo and redo">
          <Button
            className="topbar-history-button"
            type="button"
            variant="secondary"
            disabled={!canUndo || isBusy}
            onClick={() => void undo()}
            title={undoTitle}
            aria-label={undoTitle}
          >
            <Undo2 size={15} aria-hidden="true" />
            <span>Undo</span>
          </Button>

          <Button
            className="topbar-history-button"
            type="button"
            variant="secondary"
            disabled={!canRedo || isBusy}
            onClick={() => void redo()}
            title={redoTitle}
            aria-label={redoTitle}
          >
            <Redo2 size={15} aria-hidden="true" />
            <span>Redo</span>
          </Button>
        </div>

        <label className="field-label" htmlFor="theme-select">
          Theme
        </label>

        <select
          id="theme-select"
          value={theme}
          onChange={(event) => setTheme(event.target.value as ThemeMode)}
          className="select"
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
    </header>
  );
}
