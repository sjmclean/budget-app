import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "../layouts/AppShell";
import { BudgetSelectorPage } from "../pages/BudgetSelectorPage";
import { RouteErrorScreen } from "./errors/RouteErrorScreen";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <BudgetSelectorPage />,
    errorElement: <RouteErrorScreen />,
  },
  {
    element: <AppShell />,
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
          const { BudgetPage } = await import("../pages/BudgetPage");
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
    ],
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
