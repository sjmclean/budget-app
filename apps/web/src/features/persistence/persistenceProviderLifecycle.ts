import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";

export function installPersistenceProviderLifecycle(
  provider: BudgetPersistenceProvider,
): () => void {
  if (
    !provider.flush ||
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    return () => undefined;
  }

  const flushPendingWrites = () => {
    void provider.flush?.().catch((error: unknown) => {
      console.error("Unable to flush persistence provider writes.", error);
    });
  };
  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      flushPendingWrites();
    }
  };

  window.addEventListener("pagehide", flushPendingWrites);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    window.removeEventListener("pagehide", flushPendingWrites);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
