export type NavigationIcon = "budget" | "dashboard" | "reports" | "settings" | "restore" | "payees" | "switch";

export interface NavigationDestination {
  label: string;
  path: string;
  icon: NavigationIcon;
}

export type PrimaryNavigationItem =
  | ({ kind: "destination" } & NavigationDestination)
  | { kind: "accounts"; label: string };

export const navigationModel: {
  primary: PrimaryNavigationItem[];
  settings: NavigationDestination[];
} = {
  primary: [
    { kind: "destination", label: "Budget", path: "/budget", icon: "budget" },
    { kind: "accounts", label: "Accounts" },
    { kind: "destination", label: "Dashboard", path: "/dashboard", icon: "dashboard" },
    { kind: "destination", label: "Reports", path: "/reports", icon: "reports" },
  ],
  settings: [
    { label: "Switch budget", path: "/", icon: "switch" },
    { label: "Settings", path: "/settings", icon: "settings" },
    { label: "Restore Points", path: "/restore-points", icon: "restore" },
    { label: "Payee Management", path: "/payees", icon: "payees" },
  ],
};
