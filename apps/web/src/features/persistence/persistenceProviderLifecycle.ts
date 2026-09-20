import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";
import {
  activateBudgetPersistence,
  releaseActiveBudgetPersistence,
} from "./budgetDatabaseLifecycle";

export function installPersistenceProviderLifecycle(
  provider: BudgetPersistenceProvider,
): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }

  const flushPendingWrites = () => {
    void provider.flush?.().catch((error: unknown) => {
      console.error("Unable to flush persistence provider writes.", error);
    });
  };

  const releaseForSuspension = () => {
    flushPendingWrites();
    void releaseActiveBudgetPersistence().catch((error: unknown) => {
      console.error("Unable to release the suspended tab's budget database.", error);
    });
  };
  const handlePageHide = () => releaseForSuspension();
  const reactivateVisibleBudget = () => {
    if (document.visibilityState !== "visible") return;
    void import("../../stores/uiStore").then(({ useUIStore }) => {
      const budgetId = useUIStore.getState().selectedBudgetId;
      if (!budgetId || document.visibilityState !== "visible") return;
      return activateBudgetPersistence(budgetId);
    }).catch((error: unknown) => {
      console.error("Unable to reacquire the active budget database.", error);
    });
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      releaseForSuspension();
      return;
    }
    reactivateVisibleBudget();
  };

  const handlePageShow = () => reactivateVisibleBudget();

  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("pageshow", handlePageShow);
  window.addEventListener("focus", reactivateVisibleBudget);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("pageshow", handlePageShow);
    window.removeEventListener("focus", reactivateVisibleBudget);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
