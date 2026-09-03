import { Navigate, Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { useCallback, useEffect, useRef, useState } from "react";
import { resolveActiveBudgetId } from "../features/budget/activeBudget";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore } from "../stores/uiStore";
import { useAdaptiveNavigation } from "./useAdaptiveNavigation";
import { useBudgetKeyboardShortcuts } from "./useBudgetKeyboardShortcuts";
import { SyncStatusIndicator } from "./SyncStatusIndicator";
import { getBudgetPersistenceProvider } from "../features/persistence";
import { generateDueScheduledTransactionsForBudget } from "../features/accounts/scheduledTransactionMaintenance";
import { isDatabaseReleasedError } from "../features/persistence/localFirst/budgetDatabaseOwnership";

const RAIL_EXPANDED_STORAGE_KEY = "budget-app-navigation-rail-expanded";

function readRailExpanded(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(RAIL_EXPANDED_STORAGE_KEY) === "true";
}

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
  const persistenceProvider = getBudgetPersistenceProvider();
  const [railExpanded, setRailExpanded] = useState(readRailExpanded);
  const drawerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const wasDrawerOpen = useRef(false);
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
        setRailExpanded((expanded) => {
          const next = !expanded;
          window.localStorage.setItem(RAIL_EXPANDED_STORAGE_KEY, String(next));
          return next;
        });
        return;
      }

      if (navigationMode === "desktop") {
        setNavigationPinned(!navigationPinned);
      }
    },
    [navigationMode, navigationPinned, setNavigationPinned],
  );

  useEffect(() => {
    if (navigationMode !== "drawer") {
      wasDrawerOpen.current = false;
      return;
    }

    if (wasDrawerOpen.current && !navigationDrawerOpen) {
      window.requestAnimationFrame(() => drawerTriggerRef.current?.focus());
    }

    wasDrawerOpen.current = navigationDrawerOpen;
  }, [navigationDrawerOpen, navigationMode]);

  useEffect(() => {
    if (activeBudgetId && activeBudgetId !== selectedBudgetId) {
      selectBudget(activeBudgetId);
    }
  }, [activeBudgetId, selectBudget, selectedBudgetId]);

  useEffect(() => {
    if (!activeBudgetId) return;
    let disposed = false;
    const generate = () => {
      if (disposed || persistenceProvider.accountRegisterQueries?.isLocalDatabaseReleased?.()) return;
      void generateDueScheduledTransactionsForBudget(persistenceProvider, activeBudgetId)
        .catch((error) => {
          if (!isDatabaseReleasedError(error)) console.error("Scheduled transaction generation failed.", error);
        });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") generate();
    };
    generate();
    const interval = window.setInterval(generate, 60_000);
    window.addEventListener("focus", generate);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", generate);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [activeBudgetId, persistenceProvider]);

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
        <SyncStatusIndicator />
        {navigationMode === "drawer" ? (
          <button
            ref={drawerTriggerRef}
            className="navigation-drawer-trigger navigation-drawer-trigger-shell"
            type="button"
            aria-label="Open navigation"
            aria-expanded={navigationDrawerOpen}
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
