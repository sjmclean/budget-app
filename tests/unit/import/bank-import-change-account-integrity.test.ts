import assert from "node:assert/strict";
import test from "node:test";

import {
  previewTransactionCsvImport,
} from "../../../apps/web/src/features/accounts/transactionImport.js";
import {
  createImportFileHash,
  findImportedFileFingerprint,
  rememberImportedFileFingerprint,
} from "../../../apps/web/src/features/accounts/transactionImportKnowledge.js";
import {
  configureBudgetPersistenceProvider,
  resetBudgetPersistenceProvider,
} from "../../../apps/web/src/features/persistence/budgetPersistenceProviderFactory.js";
import { buildRegisterTransaction } from "../../support/builders/importMatchingBuilders.js";

function createMemoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    listKeys() {
      return [...values.keys()];
    },
  };
}

const csv = [
  "Date,Payee,Outflow",
  "2026-08-14,Example Membership Association,37.50",
].join("\n");

const mapping = {
  0: "date",
  1: "payee",
  2: "outflow",
} as const;

test("changing destination account rebuilds matching against the destination register", () => {
  const accountATransactions = [];

  const accountBTransactions = [
    buildRegisterTransaction({
      id: "account-b-existing-association",
      date: "2026-08-14",
      payee: "Example Membership Association",
      outflow: 37.5,
    }),
  ];

  const accountAPreview = previewTransactionCsvImport(
    csv,
    accountATransactions,
    mapping,
  );

  assert.equal(accountAPreview.summary.newTransactions, 1);
  assert.equal(accountAPreview.summary.exactMatches, 0);
  assert.equal(accountAPreview.candidates[0]?.selected, true);

  const accountBPreview = previewTransactionCsvImport(
    csv,
    accountBTransactions,
    mapping,
  );

  assert.equal(
    accountBPreview.summary.exactMatches,
    1,
    "the same bank row must be reassessed against the newly selected account register",
  );
  assert.equal(accountBPreview.summary.newTransactions, 0);

  const candidate = accountBPreview.candidates[0];
  assert.ok(candidate);
  assert.equal(candidate.status, "exact-match");
  assert.equal(candidate.matchedTransactionId, "account-b-existing-association");
  assert.equal(
    candidate.selected,
    false,
    "a row matched in the new account must not remain selected for duplicate import",
  );
});

test("an exact-file fingerprint in one account does not suppress the same file in another account", () => {
  const storage = createMemoryStorage();

  configureBudgetPersistenceProvider({
    metadata: {
      kind: "local-database",
      label: "test",
      description: "test",
      isProductionPersistence: false,
    },
    capabilities: {
      sharedAcrossDevices: false,
      liveUpdates: false,
      offlineWrites: true,
      backups: false,
    },
    keyValueStorage: storage,
  } as never);

  try {
    const fileHash = createImportFileHash(csv);

    rememberImportedFileFingerprint({
      accountId: "account-a",
      fileHash,
      fileName: "statement.csv",
      importedAt: "2026-08-14T00:00:00.000Z",
      transactionCount: 1,
    });

    assert.ok(
      findImportedFileFingerprint("account-a", fileHash),
      "the source account should remember its exact imported file",
    );

    assert.equal(
      findImportedFileFingerprint("account-b", fileHash),
      undefined,
      "changing destination account must not inherit another account's exact-file suppression",
    );
  } finally {
    resetBudgetPersistenceProvider();
  }
});
