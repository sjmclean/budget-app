import { getBudgetPersistenceProvider } from "./budgetPersistenceProviderFactory";
import { browserLocalStorageKeyValueStorage, type KeyValueStoragePort } from "./keyValueStoragePort";

/**
 * Returns the generic key/value backend owned by the active runtime provider.
 *
 * Registry, budget selection, import/export, history, and diagnostics must use
 * the same backend as the domain persistence services. Falling back to browser
 * storage for a non-browser provider would recreate the split-brain regression
 * that caused shared-server imports to open a different local budget.
 */
export function getActiveKeyValueStorage(): KeyValueStoragePort {
  const provider = getBudgetPersistenceProvider();

  if (provider.keyValueStorage) {
    return provider.keyValueStorage;
  }

  if (provider.metadata.kind === "browser-local-storage") {
    return browserLocalStorageKeyValueStorage;
  }

  throw new Error(
    `Persistence provider ${provider.metadata.label} does not expose key/value storage.`,
  );
}
