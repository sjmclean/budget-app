import { ArrowLeftRight, Redo2, Undo2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { resolveActiveBudget } from "../features/budget/activeBudget";
import { useBudgetUndoRedo } from "../features/budget/budgetUndoRedo";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore, type ThemeMode } from "../stores/uiStore";

export function ApplicationBar() {
  const navigate = useNavigate();
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const selectedBudgetId = useUIStore((state) => state.selectedBudgetId);
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  const activeBudget = resolveActiveBudget(budgets, selectedBudgetId);
  const { canUndo, canRedo, undoLabel, redoLabel, isBusy, undo, redo } = useBudgetUndoRedo();
  const undoTitle = canUndo && undoLabel
    ? `Undo ${undoLabel} (Ctrl/Cmd+Z)`
    : "Nothing to undo";
  const redoTitle = canRedo && redoLabel
    ? `Redo ${redoLabel} (Ctrl+Shift+Z or Ctrl+Y)`
    : "Nothing to redo";

  return (
    <header className="application-bar">
      <div className="application-bar-identity">
        <strong>{activeBudget?.name ?? "Budget App"}</strong>
        <span>Local-first envelope budgeting</span>
      </div>

      <div className="application-bar-actions">
        <Button
          className="application-bar-button"
          type="button"
          variant="secondary"
          onClick={() => navigate("/")}
          title="Switch budget"
        >
          <ArrowLeftRight size={15} aria-hidden="true" />
          <span>Switch budget</span>
        </Button>

        <Button
          className="application-bar-button"
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
          className="application-bar-button"
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

        <label className="application-bar-theme" htmlFor="application-theme-select">
          <span>Theme</span>
          <select
            id="application-theme-select"
            value={theme}
            onChange={(event) => setTheme(event.target.value as ThemeMode)}
            className="select"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>
    </header>
  );
}
