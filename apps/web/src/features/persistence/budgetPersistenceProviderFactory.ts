import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";
import {
  resetConfiguredPersistenceMetadata,
  setConfiguredPersistenceMetadata,
} from "./persistenceRuntimeMetadata";

let configuredProvider: BudgetPersistenceProvider | null = null;

/** Installs the active persistence provider for all application consumers. */
export function configureBudgetPersistenceProvider(
  provider: BudgetPersistenceProvider,
): void {
  configuredProvider = provider;
  setConfiguredPersistenceMetadata(provider.metadata);
}

export function resetBudgetPersistenceProvider(): void {
  configuredProvider = null;
  resetConfiguredPersistenceMetadata();
}

/**
 * Returns the provider installed during application bootstrap.
 *
 * There is deliberately no implicit browser-storage fallback: using feature
 * services before bootstrap is a programming error and would risk splitting
 * application state across two persistence backends.
 */
export function getBudgetPersistenceProvider(): BudgetPersistenceProvider {
  if (!configuredProvider) {
    throw new Error(
      "Budget persistence provider has not been configured. Initialise persistence before loading application features.",
    );
  }

  return configuredProvider;
}
