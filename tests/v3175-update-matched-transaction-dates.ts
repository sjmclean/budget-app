import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  defaultTransactionImportPreferences,
  readTransactionImportPreferences,
  writeTransactionImportPreferences,
} from "../apps/web/src/features/accounts/transactionImportPreferences";
import { TRANSACTION_IMPORT_PREFERENCE_ENTITY_INDEX_KEY } from "../apps/web/src/features/accounts/entities/transactionImportPreferenceEntity";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort";

class MemoryStorage implements KeyValueStoragePort {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  listKeys() { return [...this.values.keys()].sort(); }
}

const storage = new MemoryStorage();
assert.equal(
  readTransactionImportPreferences(storage).updateMatchedTransactionDates,
  false,
);
assert.equal(defaultTransactionImportPreferences.updateMatchedTransactionDates, false);
writeTransactionImportPreferences({ updateMatchedTransactionDates: true }, storage);
assert.equal(
  readTransactionImportPreferences(storage).updateMatchedTransactionDates,
  true,
);
assert.equal(storage.getItem("budget-app.transaction-import-preferences.v1"), null);
assert.notEqual(storage.getItem(TRANSACTION_IMPORT_PREFERENCE_ENTITY_INDEX_KEY), null);

const dialog = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const page = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const commitEngine = readFileSync(
  "apps/web/src/features/accounts/importCommitEngine.ts",
  "utf8",
);

assert.match(dialog, /Update matched transaction dates from imported data/);
assert.match(dialog, /readTransactionImportPreferences\(\)\.updateMatchedTransactionDates/);
assert.match(dialog, /writeTransactionImportPreferences/);
assert.match(
  commitEngine,
  /candidate\.matchedTransaction\.date !== candidate\.parsed\.date/,
);
assert.match(commitEngine, /date: shouldUpdateDate/);
assert.match(commitEngine, /\? candidate\.parsed\.date/);
assert.match(dialog, /onUpdateMatchedTransactionDates/);
assert.match(page, /onUpdateMatchedTransactionDates=/);
assert.match(page, /await updateTransaction\(update\)/);

console.log("v3.17.5 update matched transaction dates checks passed");
