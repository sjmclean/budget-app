import {
  browserLocalStorageKeyValueStorage,
  hydrateBrowserStorageBackend,
} from "./keyValueStoragePort";
import {
  exportBudgetPersistenceSnapshot,
  type BudgetPersistenceSnapshot,
} from "./persistenceSnapshot";

/**
 * Reads canonical data from the pre-local-database browser storage layout.
 *
 * This is intentionally a one-way migration boundary, not an alternate
 * persistence provider. Legacy data remains untouched after a successful read
 * so rollback copies can still be recovered manually during the migration
 * window.
 */
export async function readLegacyBrowserPersistenceSnapshot(): Promise<BudgetPersistenceSnapshot> {
  await hydrateBrowserStorageBackend();
  return exportBudgetPersistenceSnapshot(browserLocalStorageKeyValueStorage);
}
