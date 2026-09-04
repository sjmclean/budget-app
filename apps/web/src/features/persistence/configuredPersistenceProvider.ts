import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";
import { configureBudgetPersistenceProvider } from "./budgetPersistenceProviderFactory";
import { createLocalDatabasePersistenceProvider } from "./localDatabasePersistenceProvider";
import { createLocalDatabaseKeyValueStorage } from "./localDatabaseKeyValueStorage";
import { readBudgetRegistryIncludingDeleting } from "../budget/budgetRegistry";
import {
  createBudgetLifecycleControlPlaneClient,
  createLocalFirstAccountRegisterQueryClient,
} from "./localFirst";

/**
 * Creates the sole browser persistence runtime.
 *
 * owned by the local database provider; it is no longer a selectable backend.
 */
export function createConfiguredBudgetPersistenceProvider(
  userNamespace?: string,
): BudgetPersistenceProvider {
  const apiBaseUrl = (
    import.meta as ImportMeta & { env?: { VITE_BUDGET_API_URL?: string } }
  ).env?.VITE_BUDGET_API_URL;
  const lifecycle = createBudgetLifecycleControlPlaneClient({ apiBaseUrl });
  const metadataStorage = createLocalDatabaseKeyValueStorage(
    userNamespace ? { namespace: userNamespace } : {},
  );
  const provider = createLocalDatabasePersistenceProvider({
    storage: metadataStorage,
    accountRegisterQueries: createLocalFirstAccountRegisterQueryClient(lifecycle, {
      apiBaseUrl,
      restorePointBudgetName: (budgetId) => readBudgetRegistryIncludingDeleting(metadataStorage).find(({ id }) => id === budgetId)?.name,
    }),
  });
  return {
    ...provider,
    syncArchitecture: "local-first-relay",
  };
}

export function configureBudgetPersistenceProviderFromRuntime(
  userNamespace?: string,
): BudgetPersistenceProvider {
  const provider = createConfiguredBudgetPersistenceProvider(userNamespace);
  configureBudgetPersistenceProvider(provider);
  return provider;
}
