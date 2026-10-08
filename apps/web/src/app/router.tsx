import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "../layouts/AppShell";
import { BudgetSelectorPage } from "../pages/BudgetSelectorPage";
import { RouteErrorScreen } from "./errors/RouteErrorScreen";
import {
  activateBudgetPersistence,
  nudgeActiveBudgetReplication,
  releaseActiveBudgetPersistence,
} from "../features/persistence/budgetDatabaseLifecycle";
import { useUIStore } from "../stores/uiStore";
import { getBudgetPersistenceProvider } from "../features/persistence";
import { getCurrentBudgetMonth } from "../features/budget/budgetMonthNavigation";
import { prefetchBudgetMonthQuery } from "../features/persistence/reactiveQueries";

function markStartup(name: string): void {
  globalThis.performance?.mark?.(`budget-app:${name}`);
}

export const router = createBrowserRouter([
  {
    path: "/",
    async loader({ request }) {
      await releaseActiveBudgetPersistence();
      if (!request.signal.aborted) useUIStore.getState().clearSelectedBudget();
      return null;
    },
    hydrateFallbackElement: <p role="status">Preparing budgets…</p>,
    element: <BudgetSelectorPage />,
    errorElement: <RouteErrorScreen />,
  },
  {
    element: <AppShell />,
    async loader({ request }) {
      markStartup("workspace-loader:start");
      const budgetId = useUIStore.getState().selectedBudgetId;
      if (budgetId) {
        markStartup("budget-activation:start");
        await activateBudgetPersistence(budgetId, {
          deferBackgroundSync: true,
        });
        markStartup("budget-activation:end");
        const provider = getBudgetPersistenceProvider();
        if (
          provider.syncArchitecture === "local-first-relay" &&
          provider.accountRegisterQueries
        ) {
          if (new URL(request.url).pathname === "/budget") {
            markStartup("budget-primary-prefetch:start");
            await prefetchBudgetMonthQuery({
              budgetId,
              month: getCurrentBudgetMonth(),
            });
            markStartup("budget-primary-prefetch:end");
          }
          nudgeActiveBudgetReplication();
        }
      }
      markStartup("workspace-loader:end");
      return null;
    },
    hydrateFallbackElement: <p role="status">Opening budget…</p>,
    errorElement: <RouteErrorScreen />,
    children: [
      {
        path: "/dashboard",
        lazy: async () => {
          const { DashboardPage } = await import("../pages/DashboardPage");
          return { Component: DashboardPage };
        },
      },
      {
        path: "/budget",
        lazy: async () => {
          markStartup("budget-page-import:start");
          const { BudgetPage } = await import("../pages/BudgetPage");
          markStartup("budget-page-import:end");
          return { Component: BudgetPage };
        },
      },
      {
        path: "/accounts",
        lazy: async () => {
          const { AccountsPage } = await import("../pages/AccountsPage");
          return { Component: AccountsPage };
        },
      },
      {
        path: "/accounts/:accountId",
        lazy: async () => {
          const { AccountRegisterPage } = await import(
            "../pages/AccountRegisterPage"
          );
          return { Component: AccountRegisterPage };
        },
      },
      {
        path: "/reports",
        lazy: async () => {
          const { ReportsPage } = await import("../pages/ReportsPage");
          return { Component: ReportsPage };
        },
      },
      {
        path: "/settings",
        lazy: async () => {
          const { SettingsPage } = await import("../pages/SettingsPage");
          return { Component: SettingsPage };
        },
      },
      {
        path: "/developer/import-diagnostics",
        lazy: async () => {
          const { ImportDiagnosticsPage } = await import("../pages/ImportDiagnosticsPage");
          return { Component: ImportDiagnosticsPage };
        },
      },
      {
        path: "/restore-points",
        lazy: async () => {
          const { RestorePointsPage } = await import("../pages/SettingsPage");
          return { Component: RestorePointsPage };
        },
      },
      {
        path: "/payees",
        lazy: async () => {
          const { PayeeManagementPage } = await import(
            "../pages/PayeeManagementPage"
          );
          return { Component: PayeeManagementPage };
        },
      },
      {
        path: "/users",
        lazy: async () => {
          const { UserManagementPage } = await import(
            "../pages/UserManagementPage"
          );
          return { Component: UserManagementPage };
        },
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
