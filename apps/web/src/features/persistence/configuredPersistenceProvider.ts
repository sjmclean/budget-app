import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";
import { configureBudgetPersistenceProvider } from "./budgetPersistenceProviderFactory";
import { browserLocalStoragePersistenceGateway } from "./browserLocalStoragePersistenceGateway";
import { createLocalDatabasePersistenceProvider } from "./localDatabasePersistenceProvider";
import { createSharedServerPersistenceProvider } from "./sharedServerPersistenceProvider";

export type RuntimePersistenceMode =
  | "local-database"
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
 * Local database mode is now the browser default. Existing browser data is
 * copied into it on first launch and retained untouched for rollback. Set
 * VITE_BUDGET_PERSISTENCE_MODE=browser-local-storage to use the legacy provider,
 * or shared-server to retain the former server-authoritative deployment.
 */
export function createConfiguredBudgetPersistenceProvider(
  configuration: RuntimePersistenceConfiguration = readRuntimeConfiguration(),
): BudgetPersistenceProvider {
  const mode = normalisePersistenceMode(configuration.mode);

  switch (mode) {
    case "local-database":
      return createLocalDatabasePersistenceProvider();

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
  const mode = value?.trim() || "local-database";

  if (
    mode === "local-database" ||
    mode === "browser-local-storage" ||
    mode === "shared-server"
  ) {
    return mode;
  }

  throw new Error(
    `Unsupported budget persistence mode: ${mode}. ` +
      'Expected "local-database", "browser-local-storage", or "shared-server".',
  );
}
