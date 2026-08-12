import { createKeyValueBudgetPersistenceProvider } from "./createKeyValueBudgetPersistenceProvider";
import {
  createLocalDatabaseKeyValueStorage,
  type LocalDatabaseKeyValueStorage,
} from "./localDatabaseKeyValueStorage";
import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";
import type { HostedAccountRegisterQueryClient } from "./hostedAccountRegisterQueryClient";

export interface LocalDatabasePersistenceProviderOptions {
  readonly storage?: LocalDatabaseKeyValueStorage;
  readonly accountRegisterQueries?: HostedAccountRegisterQueryClient;
}

/**
 * Creates the authoritative browser-local persistence provider.
 *
 * The local database is the sole browser persistence runtime.
 */
export function createLocalDatabasePersistenceProvider(
  options: LocalDatabasePersistenceProviderOptions = {},
): BudgetPersistenceProvider {
  const storage = options.storage ?? createLocalDatabaseKeyValueStorage();

  return createKeyValueBudgetPersistenceProvider({
    storage,
    metadata: {
      kind: "local-database",
      label: "Local database",
      description:
        "This device's local database is authoritative. Server connectivity is not required for reads or writes.",
      isProductionPersistence: true,
    },
    capabilities: {
      sharedAcrossDevices: false,
      liveUpdates: false,
      offlineWrites: true,
      backups: false,
    },
    initialize: () => storage.initialize(),
    flush: () => storage.flush(),
    operationJournal: storage,
    checkpoints: storage,
    replicationStore: storage,
    conflicts: storage,
    accountRegisterQueries: options.accountRegisterQueries,
  });
}
