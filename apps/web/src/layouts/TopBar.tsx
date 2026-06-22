import { resolveActiveBudget } from "../features/budget/activeBudget";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore, type ThemeMode } from "../stores/uiStore";

export function TopBar() {
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  const selectedBudgetId = useUIStore((state) => state.selectedBudgetId);
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const activeBudget = resolveActiveBudget(budgets, selectedBudgetId);

  return (
    <header className="topbar">
      <div>
        <h1 className="topbar-title">
          {activeBudget?.name ?? "Budget App"}
        </h1>
        <p className="topbar-subtitle">Local-first envelope budgeting</p>
      </div>

      <div className="topbar-controls">
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
