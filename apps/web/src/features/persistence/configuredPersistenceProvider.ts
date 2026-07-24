import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";
import { configureBudgetPersistenceProvider } from "./budgetPersistenceProviderFactory";
import { createLocalDatabasePersistenceProvider } from "./localDatabasePersistenceProvider";

/**
 * Creates the sole browser persistence runtime.
 *
 * Legacy browser localStorage is read only through the one-way migration reader
 * owned by the local database provider; it is no longer a selectable backend.
 */
export function createConfiguredBudgetPersistenceProvider(): BudgetPersistenceProvider {
  return createLocalDatabasePersistenceProvider();
}

export function configureBudgetPersistenceProviderFromRuntime(): BudgetPersistenceProvider {
  const provider = createConfiguredBudgetPersistenceProvider();
  configureBudgetPersistenceProvider(provider);
  return provider;
}
