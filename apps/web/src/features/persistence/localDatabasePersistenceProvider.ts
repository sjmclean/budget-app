import { readLegacyBrowserPersistenceSnapshot } from "./legacyBrowserSnapshotReader";
import { createKeyValueBudgetPersistenceProvider } from "./createKeyValueBudgetPersistenceProvider";
import {
  createLocalDatabaseKeyValueStorage,
  type LocalDatabaseKeyValueStorage,
} from "./localDatabaseKeyValueStorage";
import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";
import type { HostedAccountRegisterQueryClient } from "./hostedAccountRegisterQueryClient";

const MIGRATION_MARKER_KEY = "budget-app.persistence.local-database-migration.v1";

export interface LocalDatabasePersistenceProviderOptions {
  readonly storage?: LocalDatabaseKeyValueStorage;
  readonly migrateLegacyBrowserData?: boolean;
  readonly accountRegisterQueries?: HostedAccountRegisterQueryClient;
}

/**
 * Creates the authoritative browser-local persistence provider.
 *
 * On first launch it performs a non-destructive copy of canonical budget data
 * from the legacy browser provider when the local database is empty. Legacy
 * data is deliberately retained as a rollback point.
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
    initialize: async () => {
      await storage.initialize();

      if (options.migrateLegacyBrowserData === false || !storage.isEmpty()) {
        return;
      }

      const snapshot = await readLegacyBrowserPersistenceSnapshot();
      if (snapshot.entryCount === 0) {
        return;
      }

      await storage.replaceAll({
        ...snapshot.entries,
        [MIGRATION_MARKER_KEY]: JSON.stringify({
          migratedAt: new Date().toISOString(),
          source: "browser-local-storage",
          entryCount: snapshot.entryCount,
        }),
      });
    },
    flush: () => storage.flush(),
    operationJournal: storage,
    checkpoints: storage,
    replicationStore: storage,
    conflicts: storage,
    accountRegisterQueries: options.accountRegisterQueries,
  });
}
