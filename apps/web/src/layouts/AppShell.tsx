import { Navigate, Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { useCallback, useEffect, useState } from "react";
import { resolveActiveBudgetId } from "../features/budget/activeBudget";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore } from "../stores/uiStore";
import { useAdaptiveNavigation } from "./useAdaptiveNavigation";
import { useBudgetKeyboardShortcuts } from "./useBudgetKeyboardShortcuts";
import { ApplicationBar } from "./ApplicationBar";

export function AppShell() {
  useBudgetKeyboardShortcuts();
  const navigationMode = useAdaptiveNavigation();
  const navigationPinned = useUIStore((state) => state.navigationPinned);
  const navigationDrawerOpen = useUIStore((state) => state.navigationDrawerOpen);
  const setNavigationPinned = useUIStore((state) => state.setNavigationPinned);
  const setNavigationDrawerOpen = useUIStore((state) => state.setNavigationDrawerOpen);
  const selectedBudgetId = useUIStore((state) => state.selectedBudgetId);
  const selectBudget = useUIStore((state) => state.selectBudget);
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const activeBudgetId = resolveActiveBudgetId(budgets, selectedBudgetId);
  const [railExpanded, setRailExpanded] = useState(false);
  const navigationCollapsed =
    (navigationMode === "rail" && !railExpanded) ||
    (navigationMode === "desktop" && !navigationPinned);
  const closeNavigationDrawer = useCallback(
    () => setNavigationDrawerOpen(false),
    [setNavigationDrawerOpen],
  );
  const toggleNavigationExpansion = useCallback(
    () => {
      if (navigationMode === "rail") {
        setRailExpanded((expanded) => !expanded);
        return;
      }

      if (navigationMode === "desktop") {
        setNavigationPinned(!navigationPinned);
      }
    },
    [navigationMode, navigationPinned, setNavigationPinned],
  );

  useEffect(() => {
    if (navigationMode !== "rail") {
      setRailExpanded(false);
    }
  }, [navigationMode]);

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
      <Sidebar
        mode={navigationMode}
        collapsed={navigationCollapsed}
        drawerOpen={navigationDrawerOpen}
        onToggleExpanded={toggleNavigationExpansion}
        onCloseDrawer={closeNavigationDrawer}
      />

      <div
        className={
          navigationMode === "drawer"
            ? "app-content app-content-drawer"
            : navigationCollapsed
            ? "app-content app-content-collapsed"
            : "app-content"
        }
      >
        {navigationMode !== "drawer" ? <ApplicationBar /> : null}

        {navigationMode === "drawer" ? (
          <button
            className="navigation-drawer-trigger navigation-drawer-trigger-shell"
            type="button"
            aria-label="Open navigation"
            onClick={() => setNavigationDrawerOpen(true)}
          >
            <Menu size={20} />
          </button>
        ) : null}

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
