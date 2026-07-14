import { useEffect, useState } from "react";
import { getCurrentBudgetMonth } from "./budgetMonthNavigation";

export function useCurrentBudgetMonth(): string {
  const [currentMonth, setCurrentMonth] = useState(() =>
    getCurrentBudgetMonth(),
  );

  useEffect(() => {
    function refreshCurrentMonth() {
      setCurrentMonth(getCurrentBudgetMonth());
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshCurrentMonth();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", refreshCurrentMonth);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", refreshCurrentMonth);
    };
  }, []);

  return currentMonth;
}
