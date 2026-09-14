import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import { getActiveKeyValueStorage } from "../persistence/activeKeyValueStorage";
import { readTransactionImportPreferenceEntity, writeTransactionImportPreferenceEntity } from "./entities/transactionImportPreferenceEntity";

const TRANSACTION_IMPORT_PREFERENCES_KEY =
  "budget-app.transaction-import-preferences.v1";

export interface TransactionImportPreferences {
  excludeMemos: boolean;
  updateMatchedTransactionDates: boolean;
}

export const defaultTransactionImportPreferences: TransactionImportPreferences = {
  excludeMemos: false,
  updateMatchedTransactionDates: false,
};

export function readTransactionImportPreferences(
  storage: KeyValueStoragePort = getActiveKeyValueStorage(),
): TransactionImportPreferences {
  const entity = readTransactionImportPreferenceEntity(storage);
  return entity ? {
    excludeMemos: entity.excludeMemos,
    updateMatchedTransactionDates: entity.updateMatchedTransactionDates,
  } : defaultTransactionImportPreferences;
}

export function writeTransactionImportPreferences(
  preferences: TransactionImportPreferences,
  storage: KeyValueStoragePort = getActiveKeyValueStorage(),
): void {
  writeTransactionImportPreferenceEntity(storage, preferences);
}
