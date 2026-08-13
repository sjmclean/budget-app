import assert from "node:assert/strict";
import test from "node:test";

import {
  partitionPreviouslyImportedCandidates,
  rememberImportedTransactionCandidates,
} from "../../../apps/web/src/features/accounts/transactionImportKnowledge.js";
import {
  configureBudgetPersistenceProvider,
  resetBudgetPersistenceProvider,
} from "../../../apps/web/src/features/persistence/budgetPersistenceProviderFactory.js";

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

function identicalFallbackCandidate(id: string) {
  return {
    id,
    parsed: {
      date: "2026-08-12",
      payee: "Coffee Shop",
      memo: "CARD PURCHASE",
      outflow: 20,
      inflow: 0,
      raw: {
        date: "2026-08-12",
        payee: "Coffee Shop",
        amount: "-20.00",
        memo: "CARD PURCHASE",
      },
    },
  };
}

test("a legitimate identical transaction from a different source file is not silently suppressed", () => {
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
    const firstFileTransaction = identicalFallbackCandidate("file-a-row-2");

    rememberImportedTransactionCandidates({
      accountId: "checking",
      fileType: "csv",
      candidates: [firstFileTransaction],
      importedAt: "2026-08-01T00:00:00.000Z",
    });

    // This represents a different bank file containing another genuine
    // transaction whose fallback fields happen to be identical.
    const secondFileTransaction = identicalFallbackCandidate("file-b-row-2");

    const partition = partitionPreviouslyImportedCandidates({
      accountId: "checking",
      fileType: "csv",
      candidates: [secondFileTransaction],
    });

    assert.deepEqual(
      partition.activeCandidates.map((candidate) => candidate.id),
      ["file-b-row-2"],
      "a fallback identity from an earlier file must not silently suppress a distinct later transaction",
    );
    assert.equal(partition.previouslyImportedCandidates.length, 0);
  } finally {
    resetBudgetPersistenceProvider();
  }
});

test("a bank-provided external transaction ID still deduplicates across source files", () => {
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
    const firstFileTransaction = {
      ...identicalFallbackCandidate("file-a-row-2"),
      parsed: {
        ...identicalFallbackCandidate("file-a-row-2").parsed,
        raw: {
          date: "2026-08-12",
          payee: "Coffee Shop",
          amount: "-20.00",
          memo: "CARD PURCHASE",
          "Transaction ID": "bank-transaction-123",
        },
      },
    };

    rememberImportedTransactionCandidates({
      accountId: "checking",
      fileType: "csv",
      candidates: [firstFileTransaction],
      importedAt: "2026-08-01T00:00:00.000Z",
    });

    const secondFileTransaction = {
      ...identicalFallbackCandidate("file-b-row-2"),
      parsed: {
        ...identicalFallbackCandidate("file-b-row-2").parsed,
        raw: {
          date: "2026-08-12",
          payee: "Coffee Shop",
          amount: "-20.00",
          memo: "CARD PURCHASE",
          "Transaction ID": "bank-transaction-123",
        },
      },
    };

    const partition = partitionPreviouslyImportedCandidates({
      accountId: "checking",
      fileType: "csv",
      candidates: [secondFileTransaction],
    });

    assert.equal(partition.activeCandidates.length, 0);
    assert.deepEqual(
      partition.previouslyImportedCandidates.map((candidate) => candidate.id),
      ["file-b-row-2"],
      "a real external bank transaction ID remains safe to deduplicate across files",
    );
  } finally {
    resetBudgetPersistenceProvider();
  }
});
