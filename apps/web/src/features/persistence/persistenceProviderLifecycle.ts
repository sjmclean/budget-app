import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";
import { getActiveBudgetIdFromStorage } from "../budget/budgetDataScope";
import { activateBudgetPersistence } from "./budgetDatabaseLifecycle";

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

  const handlePageHide = () => flushPendingWrites();
  const reactivateVisibleBudget = () => {
    if (document.visibilityState !== "visible" || !provider.keyValueStorage) return;
    const budgetId = getActiveBudgetIdFromStorage(provider.keyValueStorage);
    if (!budgetId) return;
    void activateBudgetPersistence(budgetId).catch((error: unknown) => {
      console.error("Unable to reacquire the active budget database.", error);
    });
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      flushPendingWrites();
      return;
    }
    reactivateVisibleBudget();
  };

  const handlePageShow = () => reactivateVisibleBudget();

  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("pageshow", handlePageShow);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("pageshow", handlePageShow);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
