import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";
import { configureBudgetPersistenceProvider } from "./budgetPersistenceProviderFactory";

declare global {
  interface Window {
    __BUDGET_APP_PERSISTENCE_PROVIDER__?: BudgetPersistenceProvider;
  }
}

/**
 * Runtime host integration point for desktop/Tauri persistence.
 *
 * Browser builds must not import SQLite repositories or native database drivers.
 * A host runtime may expose a provider before React renders.
 */
export function getHostBudgetPersistenceProvider(): BudgetPersistenceProvider | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.__BUDGET_APP_PERSISTENCE_PROVIDER__ ?? null;
}

export function bootstrapHostBudgetPersistenceProvider(): BudgetPersistenceProvider | null {
  const provider = getHostBudgetPersistenceProvider();

  if (provider) {
    configureBudgetPersistenceProvider(provider);
  }

  return provider;
}

