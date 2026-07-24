import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";
import { publishPersistenceChange } from "./persistenceChangeBus";

export function installPersistenceProviderLifecycle(
  provider: BudgetPersistenceProvider,
): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }

  let stopWatching: (() => void) | null = null;
  let disposed = false;

  const flushPendingWrites = () => {
    void provider.flush?.().catch((error: unknown) => {
      console.error("Unable to flush persistence provider writes.", error);
    });
  };

  const stopProviderWatch = () => {
    stopWatching?.();
    stopWatching = null;
  };

  const startProviderWatch = () => {
    if (
      disposed ||
      stopWatching !== null ||
      !provider.watch ||
      document.visibilityState === "hidden"
    ) {
      return;
    }

    stopWatching = provider.watch(() => {
      publishPersistenceChange({ source: "shared-server" });
    });
  };

  const handlePageHide = () => {
    stopProviderWatch();
    flushPendingWrites();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      stopProviderWatch();
      flushPendingWrites();
      return;
    }

    startProviderWatch();
  };

  window.addEventListener("pagehide", handlePageHide);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  startProviderWatch();

  return () => {
    disposed = true;
    stopProviderWatch();
    window.removeEventListener("pagehide", handlePageHide);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
