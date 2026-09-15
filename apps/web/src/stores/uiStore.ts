import { create } from "zustand";
import { SELECTED_BUDGET_STORAGE_KEY } from "../features/budget/budgetDataScope";
import { getActiveKeyValueStorage } from "../features/persistence/activeKeyValueStorage";
import { parseTheme, THEME_STORAGE_KEY, type ThemeMode } from "../app/theme";

export type { ThemeMode } from "../app/theme";

interface UIState {
  sidebarCollapsed: boolean;
  navigationPinned: boolean;
  navigationDrawerOpen: boolean;
  theme: ThemeMode;
  selectedBudgetId: string | null;

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setNavigationPinned: (pinned: boolean) => void;
  setNavigationDrawerOpen: (open: boolean) => void;
  setTheme: (theme: ThemeMode) => void;
  selectBudget: (budgetId: string) => void;
  clearSelectedBudget: () => void;
}

const selectedBudgetStorageKey = SELECTED_BUDGET_STORAGE_KEY;
const navigationPinnedStorageKey = "budget-app-navigation-pinned";

function getInitialNavigationPinned(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(navigationPinnedStorageKey) !== "false";
}

function getInitialSelectedBudgetId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedBudgetId = getActiveKeyValueStorage().getItem(selectedBudgetStorageKey);
  return storedBudgetId?.trim() || null;
}

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }

  return parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
}

export const useUIStore = create<UIState>((set) => ({
  // Always start expanded
  sidebarCollapsed: false,
  navigationPinned: getInitialNavigationPinned(),
  navigationDrawerOpen: false,

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

  setNavigationPinned: (pinned) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(navigationPinnedStorageKey, String(pinned));
    }

    set({ navigationPinned: pinned });
  },

  setNavigationDrawerOpen: (open) => set({ navigationDrawerOpen: open }),

  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }

    set({ theme });
  },

  selectBudget: (budgetId) => {
    if (typeof window !== "undefined") {
      getActiveKeyValueStorage().setItem(selectedBudgetStorageKey, budgetId);
    }

    set({
      selectedBudgetId: budgetId,
    });
  },

  clearSelectedBudget: () => {
    if (typeof window !== "undefined") {
      getActiveKeyValueStorage().removeItem(selectedBudgetStorageKey);
    }

    set({
      selectedBudgetId: null,
    });
  },
}));
