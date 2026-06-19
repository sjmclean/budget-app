import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";

interface UIState {
  sidebarCollapsed: boolean;
  theme: ThemeMode;

  toggleSidebar: () => void;
  setTheme: (theme: ThemeMode) => void;
}

const getInitialTheme = (): ThemeMode => {
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = window.localStorage.getItem("budget-app-theme");

  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }

  return "system";
};

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  theme: getInitialTheme(),

  toggleSidebar: () =>
    set((state) => ({
      sidebarCollapsed: !state.sidebarCollapsed,
    })),

  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("budget-app-theme", theme);
    }

    set({ theme });
  },
}));