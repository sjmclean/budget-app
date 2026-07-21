import { useEffect, useState } from "react";

export type AdaptiveNavigationMode = "desktop" | "rail" | "drawer";

function resolveNavigationMode(): AdaptiveNavigationMode {
  if (typeof window === "undefined") {
    return "desktop";
  }

  if (window.matchMedia("(max-width: 1024px)").matches) {
    return "drawer";
  }

  if (window.matchMedia("(max-width: 1279px)").matches) {
    return "rail";
  }

  return "desktop";
}

export function useAdaptiveNavigation(): AdaptiveNavigationMode {
  const [mode, setMode] = useState(resolveNavigationMode);

  useEffect(() => {
    const tabletQuery = window.matchMedia("(max-width: 1024px)");
    const laptopQuery = window.matchMedia("(max-width: 1279px)");
    const updateMode = () => setMode(resolveNavigationMode());

    tabletQuery.addEventListener("change", updateMode);
    laptopQuery.addEventListener("change", updateMode);

    return () => {
      tabletQuery.removeEventListener("change", updateMode);
      laptopQuery.removeEventListener("change", updateMode);
    };
  }, []);

  return mode;
}
