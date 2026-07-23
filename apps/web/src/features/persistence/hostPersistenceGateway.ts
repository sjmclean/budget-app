import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";
import { configureBudgetPersistenceProvider } from "./budgetPersistenceProviderFactory";

/** @deprecated Compatibility alias for host integrations using the old name. */
export type HostPersistenceGateway = BudgetPersistenceProvider;

declare global {
  interface Window {
    __BUDGET_APP_PERSISTENCE_PROVIDER__?: BudgetPersistenceProvider;
    /** @deprecated Use __BUDGET_APP_PERSISTENCE_PROVIDER__. */
    __BUDGET_APP_PERSISTENCE_GATEWAY__?: BudgetPersistenceProvider;
  }
}

/**
 * Runtime host integration point for desktop/Tauri persistence.
 *
 * Browser builds must not import SQLite repositories or native database drivers.
 * A host runtime may expose a provider before React renders. The legacy gateway
 * global remains supported while host integrations migrate to provider naming.
 */
export function getHostBudgetPersistenceProvider(): BudgetPersistenceProvider | null {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    window.__BUDGET_APP_PERSISTENCE_PROVIDER__ ??
    window.__BUDGET_APP_PERSISTENCE_GATEWAY__ ??
    null
  );
}

export function bootstrapHostBudgetPersistenceProvider(): BudgetPersistenceProvider | null {
  const provider = getHostBudgetPersistenceProvider();

  if (provider) {
    configureBudgetPersistenceProvider(provider);
  }

  return provider;
}

/** @deprecated Prefer getHostBudgetPersistenceProvider. */
export const getHostPersistenceGateway = getHostBudgetPersistenceProvider;

/** @deprecated Prefer bootstrapHostBudgetPersistenceProvider. */
export const bootstrapHostPersistenceGateway =
  bootstrapHostBudgetPersistenceProvider;
