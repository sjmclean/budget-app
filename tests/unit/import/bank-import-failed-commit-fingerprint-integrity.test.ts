import assert from "node:assert/strict";
import test from "node:test";

import {
  commitImportSession,
  ImportCommitExecutionError,
  type ImportCommitSession,
} from "../../../apps/web/src/features/accounts/importCommitEngine.js";
import {
  previewTransactionCsvImport,
} from "../../../apps/web/src/features/accounts/transactionImport.js";
import {
  buildTransactionImportSourceIdentities,
  createImportFileHash,
  findImportedFileFingerprint,
  partitionPreviouslyImportedCandidates,
} from "../../../apps/web/src/features/accounts/transactionImportKnowledge.js";
import {
  createEmptyMerchantKnowledgeStore,
} from "../../../apps/web/src/features/accounts/merchantKnowledge.js";
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

test("failed register commit does not persist import fingerprints or suppress retry", async () => {
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
    const csv = [
      "Date,Payee,Outflow",
      "2026-08-14,Example Membership Association,37.50",
    ].join("\n");

    const mapping = {
      0: "date",
      1: "payee",
      2: "outflow",
    } as const;

    const preview = previewTransactionCsvImport(
      csv,
      [],
      mapping,
    );

    assert.equal(preview.summary.newTransactions, 1);

    const candidate = preview.candidates[0];
    assert.ok(candidate);
    assert.equal(candidate.status, "new");
    assert.equal(candidate.selected, true);

    const fileHash = createImportFileHash(csv);

    const session: ImportCommitSession = {
      accountId: "checking",
      accountName: "Checking",
      importedCandidates: [candidate],
      matchedCandidates: [],
      completedSourceCandidates: [candidate],
      sourceIdentities: buildTransactionImportSourceIdentities(
        "csv",
        [candidate],
      ),
      skippedCount: 0,
      previouslyImportedCount: 0,
      alreadyRepresentedCount: 0,
      editedMatchedCandidateIds: new Set(),
      includeMemos: true,
      updateMatchedTransactionDates: false,
      categories: [],
      accounts: [{ id: "checking", name: "Checking" }],
      merchantKnowledge: createEmptyMerchantKnowledgeStore(),
      file: {
        fileType: "csv",
        fileName: "statement.csv",
        fileHash,
      },
    };

    const failure = new Error("sqlite batch rolled back");

    await assert.rejects(
      () =>
        commitImportSession(session, {
          commitTransactionBatch: async () => {
            throw failure;
          },
          addTransactions: async () => {},
          updateTransactions: async () => {},
        }),
      (error) => {
        assert.ok(error instanceof ImportCommitExecutionError);
        assert.equal(error.audit.status, "failed");
        assert.equal(error.audit.failedStage, "Commit register batch");
        assert.equal(error.audit.knowledgePersisted, false);
        assert.equal(error.audit.identityCount, 0);
        return true;
      },
    );

    assert.equal(
      findImportedFileFingerprint("checking", fileHash),
      undefined,
      "a rolled-back register commit must not mark the source file as successfully imported",
    );

    const retryPartition = partitionPreviouslyImportedCandidates({
      fileType: "csv",
      candidates: [candidate],
      importedOccurrenceCounts: {},
    });

    assert.deepEqual(
      retryPartition.previouslyImportedCandidates,
      [],
      "a failed commit must not create durable transaction provenance",
    );

    assert.deepEqual(
      retryPartition.activeCandidates.map((entry) => entry.id),
      [candidate.id],
      "the source row must remain eligible for a safe retry after rollback",
    );
  } finally {
    resetBudgetPersistenceProvider();
  }
});
