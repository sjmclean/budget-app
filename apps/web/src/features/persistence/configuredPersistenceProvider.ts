import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";
import { configureBudgetPersistenceProvider } from "./budgetPersistenceProviderFactory";
import { browserLocalStoragePersistenceGateway } from "./browserLocalStoragePersistenceGateway";
import { createSharedServerPersistenceProvider } from "./sharedServerPersistenceProvider";

export type RuntimePersistenceMode =
  | "browser-local-storage"
  | "shared-server";

export interface RuntimePersistenceConfiguration {
  mode?: string;
  apiBaseUrl?: string;
}

interface BudgetAppImportMetaEnv {
  readonly VITE_BUDGET_PERSISTENCE_MODE?: string;
  readonly VITE_BUDGET_API_URL?: string;
}

/**
 * Creates the provider selected by deployment configuration.
 *
 * Browser localStorage remains the safe default. Shared-server mode is only
 * activated when explicitly requested, preventing an accidental switch away
 * from an existing browser budget.
 */
export function createConfiguredBudgetPersistenceProvider(
  configuration: RuntimePersistenceConfiguration = readRuntimeConfiguration(),
): BudgetPersistenceProvider {
  const mode = normalisePersistenceMode(configuration.mode);

  switch (mode) {
    case "browser-local-storage":
      return browserLocalStoragePersistenceGateway;

    case "shared-server":
      return createSharedServerPersistenceProvider({
        baseUrl: configuration.apiBaseUrl?.trim() ?? "",
      });
  }
}

export function configureBudgetPersistenceProviderFromRuntime(
  configuration?: RuntimePersistenceConfiguration,
): BudgetPersistenceProvider {
  const provider = createConfiguredBudgetPersistenceProvider(configuration);
  configureBudgetPersistenceProvider(provider);
  return provider;
}

function readRuntimeConfiguration(): RuntimePersistenceConfiguration {
  const environment = (
    import.meta as ImportMeta & { readonly env?: BudgetAppImportMetaEnv }
  ).env;

  return {
    mode: environment?.VITE_BUDGET_PERSISTENCE_MODE,
    apiBaseUrl: environment?.VITE_BUDGET_API_URL,
  };
}

function normalisePersistenceMode(value: string | undefined): RuntimePersistenceMode {
  const mode = value?.trim() || "browser-local-storage";

  if (mode === "browser-local-storage" || mode === "shared-server") {
    return mode;
  }

  throw new Error(
    `Unsupported budget persistence mode: ${mode}. ` +
      'Expected "browser-local-storage" or "shared-server".',
  );
}
