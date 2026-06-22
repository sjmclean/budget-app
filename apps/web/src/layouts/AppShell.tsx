import { Navigate, Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { useEffect } from "react";
import { resolveActiveBudgetId } from "../features/budget/activeBudget";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore } from "../stores/uiStore";

export function AppShell() {
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);
  const selectedBudgetId = useUIStore((state) => state.selectedBudgetId);
  const selectBudget = useUIStore((state) => state.selectBudget);
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const activeBudgetId = resolveActiveBudgetId(budgets, selectedBudgetId);

  useEffect(() => {
    if (activeBudgetId && activeBudgetId !== selectedBudgetId) {
      selectBudget(activeBudgetId);
    }
  }, [activeBudgetId, selectBudget, selectedBudgetId]);

  if (!activeBudgetId) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="app-shell">
      <Sidebar />

      <div
        className={
          sidebarCollapsed
            ? "app-content app-content-collapsed"
            : "app-content"
        }
      >
        <TopBar />

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
