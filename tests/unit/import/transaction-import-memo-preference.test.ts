import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createTransactionImportPreferenceEntityRepository,
  TRANSACTION_IMPORT_PREFERENCE_ENTITY_ID,
} from "../../../apps/web/src/features/accounts/entities/transactionImportPreferenceEntity.js";
import {
  defaultTransactionImportPreferences,
  readTransactionImportPreferences,
  writeTransactionImportPreferences,
} from "../../../apps/web/src/features/accounts/transactionImportPreferences.js";
import type { KeyValueStoragePort } from "../../../apps/web/src/features/persistence/keyValueStoragePort.js";
import {
  buildRegisterTransactionsFromImport,
  parseTransactionQif,
  type ParsedImportTransaction,
  type TransactionImportCandidate,
} from "../../../apps/web/src/features/accounts/transactionImport.js";
import {
  createHybridTimestamp,
  createLwwRegister,
} from "../../../packages/sync/src/browser.js";

function createMemoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    listKeys: () => [...values.keys()],
  };
}

function candidate(parsed: ParsedImportTransaction): TransactionImportCandidate {
  return {
    id: "row-2",
    parsed,
    status: "new",
    reason: "new transaction",
    selected: true,
    errors: [],
    lifecycle: {
      source: {
        rowNumber: parsed.rowNumber,
        date: parsed.date,
        rawPayee: parsed.payee,
        memo: parsed.memo,
        inflow: parsed.inflow,
        outflow: parsed.outflow,
      },
      merchant: {
        canonicalPayee: parsed.payee,
        suggestedCategoryName: null,
        transferAccountName: null,
      },
      proposal: {
        payee: parsed.payee,
        categoryName: null,
        transferAccountName: null,
      },
    },
  };
}

test("legacy transaction-import preferences remain readable and default memo exclusion off", () => {
  const storage = createMemoryStorage();
  const timestamp = createHybridTimestamp(1, 0, "legacy-test");
  createTransactionImportPreferenceEntityRepository(storage).save({
    metadata: {
      id: TRANSACTION_IMPORT_PREFERENCE_ENTITY_ID,
      createdAt: timestamp,
      tombstone: null,
    },
    fields: {
      id: createLwwRegister(TRANSACTION_IMPORT_PREFERENCE_ENTITY_ID, timestamp),
      updateMatchedTransactionDates: createLwwRegister(true, timestamp),
    },
  });

  assert.deepEqual(readTransactionImportPreferences(storage), {
    excludeMemos: false,
    updateMatchedTransactionDates: true,
  });
});

test("memo exclusion persists and is reread for a subsequent fresh import", () => {
  const storage = createMemoryStorage();
  assert.deepEqual(
    readTransactionImportPreferences(storage),
    defaultTransactionImportPreferences,
  );

  writeTransactionImportPreferences({
    excludeMemos: true,
    updateMatchedTransactionDates: false,
  }, storage);
  assert.equal(readTransactionImportPreferences(storage).excludeMemos, true);

  writeTransactionImportPreferences({
    excludeMemos: false,
    updateMatchedTransactionDates: false,
  }, storage);
  assert.equal(readTransactionImportPreferences(storage).excludeMemos, false);

  const dialogSource = readFileSync(new URL(
    "../../../apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
    import.meta.url,
  ), "utf8");
  assert.match(dialogSource, /useState\(readTransactionImportPreferences\)/);
  assert.match(dialogSource, /initialImportPreferences\.excludeMemos/);
});

test("QIF memo inclusion follows the import preference for a new transaction", () => {
  const [parsed] = parseTransactionQif([
    "!Type:Bank",
    "D09/14/2026",
    "T-12.34",
    "PExample Payee",
    "MExample memo",
    "^",
  ].join("\n"), { dateFormat: "mdy", amountFormat: "dot-decimal" });
  assert.ok(parsed);

  const included = buildRegisterTransactionsFromImport([candidate(parsed)], {
    includeMemos: true,
    identityScope: "qif:memo-included",
  });
  const excluded = buildRegisterTransactionsFromImport([candidate(parsed)], {
    includeMemos: false,
    identityScope: "qif:memo-excluded",
  });

  assert.equal(included[0]?.payee, "Example Payee");
  assert.equal(included[0]?.memo, "Example memo");
  assert.equal(excluded[0]?.payee, "Example Payee");
  assert.equal(excluded[0]?.memo, undefined);
});

test("QIF memo remains the documented payee fallback when P is absent", () => {
  const [parsed] = parseTransactionQif([
    "!Type:Bank",
    "D09/14/2026",
    "T-12.34",
    "MMemo-only description",
    "^",
  ].join("\n"), { dateFormat: "mdy", amountFormat: "dot-decimal" });
  assert.ok(parsed);
  assert.equal(parsed.payee, "Memo-only description");
  assert.equal(parsed.memo, "Memo-only description");

  const [transaction] = buildRegisterTransactionsFromImport([candidate(parsed)], {
    includeMemos: false,
    identityScope: "qif:memo-payee-fallback",
  });
  assert.equal(transaction?.payee, "Memo-only description");
  assert.equal(transaction?.memo, undefined);
});
