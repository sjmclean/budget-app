import {
  browserLocalStorageKeyValueStorage,
  type KeyValueStoragePort,
} from "../persistence/keyValueStoragePort";

const TRANSACTION_IMPORT_PREFERENCES_KEY =
  "budget-app.transaction-import-preferences.v1";

export interface TransactionImportPreferences {
  updateMatchedTransactionDates: boolean;
}

export const defaultTransactionImportPreferences: TransactionImportPreferences = {
  updateMatchedTransactionDates: false,
};

export function readTransactionImportPreferences(
  storage: KeyValueStoragePort = browserLocalStorageKeyValueStorage,
): TransactionImportPreferences {
  try {
    const stored = storage.getItem(TRANSACTION_IMPORT_PREFERENCES_KEY);
    if (!stored) return defaultTransactionImportPreferences;

    const parsed = JSON.parse(stored) as Partial<TransactionImportPreferences>;
    return {
      updateMatchedTransactionDates:
        parsed.updateMatchedTransactionDates === true,
    };
  } catch {
    return defaultTransactionImportPreferences;
  }
}

export function writeTransactionImportPreferences(
  preferences: TransactionImportPreferences,
  storage: KeyValueStoragePort = browserLocalStorageKeyValueStorage,
): void {
  storage.setItem(
    TRANSACTION_IMPORT_PREFERENCES_KEY,
    JSON.stringify(preferences),
  );
}
