import { useEffect, type ReactNode } from "react";
import { useUIStore } from "../stores/uiStore";
import { synchronizeTheme } from "./theme";

interface ThemeBootstrapProps {
  children: ReactNode;
}

export function ThemeBootstrap({ children }: ThemeBootstrapProps) {
  const theme = useUIStore((state) => state.theme);

  useEffect(() => {
    return synchronizeTheme(theme, {
      root: document.documentElement,
      matchMedia: window.matchMedia.bind(window),
    });
  }, [theme]);

  return <>{children}</>;
}
