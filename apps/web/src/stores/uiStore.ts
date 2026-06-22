import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";

interface UIState {
  sidebarCollapsed: boolean;
  theme: ThemeMode;
  selectedBudgetId: string | null;

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: ThemeMode) => void;
  selectBudget: (budgetId: string) => void;
  clearSelectedBudget: () => void;
}

const themeStorageKey = "budget-app-theme";
const selectedBudgetStorageKey = "budget-app.selected-budget-id.v1";

function getInitialSelectedBudgetId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedBudgetId = window.localStorage.getItem(selectedBudgetStorageKey);
  return storedBudgetId?.trim() || null;
}

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }

  const storedTheme = window.localStorage.getItem(themeStorageKey);

  if (
    storedTheme === "light" ||
    storedTheme === "dark" ||
    storedTheme === "system"
  ) {
    return storedTheme;
  }

  return "system";
}

export const useUIStore = create<UIState>((set) => ({
  // Always start expanded
  sidebarCollapsed: false,

  theme: getInitialTheme(),
  selectedBudgetId: getInitialSelectedBudgetId(),

  toggleSidebar: () =>
    set((state) => ({
      sidebarCollapsed: !state.sidebarCollapsed,
    })),

  setSidebarCollapsed: (collapsed) =>
    set({
      sidebarCollapsed: collapsed,
    }),

  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(themeStorageKey, theme);
    }

    set({ theme });
  },

  selectBudget: (budgetId) =>
    set({
      selectedBudgetId: budgetId,
    }),

  clearSelectedBudget: () =>
    set({
      selectedBudgetId: getInitialSelectedBudgetId(),
    }),
}));