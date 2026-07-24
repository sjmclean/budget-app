import type {
  BudgetPersistenceProvider,
  PersistenceBackendKind,
} from "./budgetPersistenceProvider";
import { browserLocalStoragePersistenceGateway } from "./browserLocalStoragePersistenceGateway";
import {
  resetConfiguredPersistenceMetadata,
  setConfiguredPersistenceMetadata,
} from "./persistenceRuntimeMetadata";

let configuredProvider: BudgetPersistenceProvider | null = null;

/**
 * Installs the active persistence provider for all application consumers.
 */
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
 * Single runtime selection point for budget persistence.
 *
 * Browser builds default to localStorage. Host runtimes may configure another
 * provider before React renders. Explicit backend selection remains available
 * for adapter validation without leaking concrete implementations into UI code.
 */
export function getBudgetPersistenceProvider(
  backend?: PersistenceBackendKind,
  selectedProvider?: BudgetPersistenceProvider,
): BudgetPersistenceProvider {
  if (!backend && configuredProvider) {
    return configuredProvider;
  }

  const selectedBackend = backend ?? "browser-local-storage";

  switch (selectedBackend) {
    case "browser-local-storage":
      return browserLocalStoragePersistenceGateway;

    case "local-database":
      if (!selectedProvider) {
        throw new Error(
          "Local database provider requested but no provider instance was supplied.",
        );
      }

      return selectedProvider;

    case "sqlite-adapter":
      if (!selectedProvider) {
        throw new Error(
          "SQLite provider requested but no SQLite provider instance was supplied.",
        );
      }

      return selectedProvider;

  }
}
