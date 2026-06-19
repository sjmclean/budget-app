import { useEffect, type ReactNode } from "react";
import { useUIStore } from "../stores/uiStore";

interface ThemeBootstrapProps {
  children: ReactNode;
}

function resolveSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeBootstrap({ children }: ThemeBootstrapProps) {
  const theme = useUIStore((state) => state.theme);

  useEffect(() => {
    const root = document.documentElement;
    const resolvedTheme = theme === "system" ? resolveSystemTheme() : theme;

    root.dataset.theme = resolvedTheme;
    root.classList.toggle("dark", resolvedTheme === "dark");
  }, [theme]);

  return <>{children}</>;
}
