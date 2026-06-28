import { useEffect, useState } from "react";

export type RegisterLayoutMode = "desktop" | "compact" | "tablet" | "mobile";

export const REGISTER_LAYOUT_BREAKPOINTS = {
  compact: 1280,
  tablet: 900,
  mobile: 680,
} as const;

export function resolveRegisterLayoutMode(width: number): RegisterLayoutMode {
  if (width <= REGISTER_LAYOUT_BREAKPOINTS.mobile) {
    return "mobile";
  }

  if (width <= REGISTER_LAYOUT_BREAKPOINTS.tablet) {
    return "tablet";
  }

  if (width <= REGISTER_LAYOUT_BREAKPOINTS.compact) {
    return "compact";
  }

  return "desktop";
}

function getCurrentRegisterLayoutMode(): RegisterLayoutMode {
  if (typeof window === "undefined") {
    return "desktop";
  }

  return resolveRegisterLayoutMode(window.innerWidth);
}

export function useRegisterLayoutMode(): RegisterLayoutMode {
  const [layoutMode, setLayoutMode] = useState<RegisterLayoutMode>(
    getCurrentRegisterLayoutMode,
  );

  useEffect(() => {
    function updateLayoutMode() {
      setLayoutMode(getCurrentRegisterLayoutMode());
    }

    updateLayoutMode();
    window.addEventListener("resize", updateLayoutMode);

    return () => window.removeEventListener("resize", updateLayoutMode);
  }, []);

  return layoutMode;
}
