import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "../layouts/AppShell";
import { BudgetSelectorPage } from "../pages/BudgetSelectorPage";
import { DashboardPage } from "../pages/DashboardPage";
import { BudgetPage } from "../pages/BudgetPage";
import { AccountsPage } from "../pages/AccountsPage";
import { AccountRegisterPage } from "../pages/AccountRegisterPage";
import { ReportsPage } from "../pages/ReportsPage";
import { RestorePointsPage, SettingsPage } from "../pages/SettingsPage";
import { PayeeManagementPage } from "../pages/PayeeManagementPage";
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
        element: <DashboardPage />,
      },
      {
        path: "/budget",
        element: <BudgetPage />,
      },
      {
        path: "/accounts",
        element: <AccountsPage />,
      },
      {
        path: "/accounts/:accountId",
        element: <AccountRegisterPage />,
      },
      {
        path: "/reports",
        element: <ReportsPage />,
      },
      {
        path: "/settings",
        element: <SettingsPage />,
      },
      {
        path: "/restore-points",
        element: <RestorePointsPage />,
      },
      {
        path: "/payees",
        element: <PayeeManagementPage />,
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
