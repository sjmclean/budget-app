import assert from "node:assert/strict";
import test from "node:test";

import {
  commitImportSession,
  ImportCommitExecutionError,
  prepareImportCommit,
  type ImportCommitSession,
} from "../../../apps/web/src/features/accounts/importCommitEngine.js";
import type {
  RegisterTransactionView,
} from "../../../apps/web/src/features/accounts/accountRegisterTypes.js";
import {
  createEmptyMerchantKnowledgeStore,
} from "../../../apps/web/src/features/accounts/merchantKnowledge.js";
import type {
  TransactionImportCandidate,
} from "../../../apps/web/src/features/accounts/transactionImport.js";
import {
  stableImportTransactionId,
} from "../../../apps/web/src/features/accounts/transactionImportCommit.js";
import {
  buildTransactionImportSourceIdentities,
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

function newCandidate(): TransactionImportCandidate {
  return {
    id: "row-2",
    parsed: {
      rowNumber: 2,
      date: "2026-08-20",
      payee: "Example Merchant",
      memo: "Bank memo",
      inflow: 0,
      outflow: 25,
      raw: {
        date: "2026-08-20",
        payee: "Example Merchant",
        amount: "-25.00",
        "Transaction ID": "bank-transaction-123",
      },
    },
    status: "new",
    reason: "new transaction",
    selected: true,
    reviewDecision: "import-as-new",
    errors: [],
    lifecycle: {
      source: {
        rowNumber: 2,
        date: "2026-08-20",
        rawPayee: "Example Merchant",
        memo: "Bank memo",
        inflow: 0,
        outflow: 25,
      },
      merchant: {
        canonicalPayee: "Example Merchant",
        suggestedCategoryName: null,
        transferAccountName: null,
      },
      proposal: {
        payee: "Example Merchant",
        categoryName: null,
        transferAccountName: null,
      },
    },
  };
}

function matchedTransaction(): RegisterTransactionView {
  return {
    id: "register-existing-1",
    date: "2026-08-20",
    rawPayee: "Example Merchant",
    attachmentCount: 0,
    payee: "Example Merchant",
    category: "",
    inflow: 0,
    outflow: 25,
    runningBalance: -25,
    cleared: false,
    reconciled: false,
  };
}

function matchedCandidate(): TransactionImportCandidate {
  const transaction = matchedTransaction();

  return {
    id: "row-2",
    parsed: {
      rowNumber: 2,
      date: "2026-08-20",
      payee: "Example Merchant",
      inflow: 0,
      outflow: 25,
      raw: {
        date: "2026-08-20",
        payee: "Example Merchant",
        amount: "-25.00",
        "Transaction ID": "bank-transaction-123",
      },
    },
    status: "exact-match",
    reason: "matched existing transaction",
    matchedTransactionId: transaction.id,
    matchedTransaction: transaction,
    selected: false,
    errors: [],
    lifecycle: {
      source: {
        rowNumber: 2,
        date: "2026-08-20",
        rawPayee: "Example Merchant",
        inflow: 0,
        outflow: 25,
      },
      merchant: {
        canonicalPayee: "Example Merchant",
        suggestedCategoryName: null,
        transferAccountName: null,
      },
      proposal: {
        payee: "Example Merchant",
        categoryName: null,
        transferAccountName: null,
      },
    },
  };
}

function importedSession(
  candidate: TransactionImportCandidate,
): ImportCommitSession {
  const fileHash = "sha256:provenance-import-fixture";

  return {
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
}

function matchedSession(
  candidate: TransactionImportCandidate,
): ImportCommitSession {
  return {
    accountId: "checking",
    accountName: "Checking",
    importedCandidates: [],
    matchedCandidates: [candidate],
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
      fileHash: "sha256:provenance-match-fixture",
    },
  };
}

test("new imported candidate provenance targets the same stable transaction ID as the addition", () => {
  const candidate = newCandidate();
  const session = importedSession(candidate);

  const plan = prepareImportCommit(session);
  const addition = plan.additions[0];
  const provenance = plan.provenanceAssignments[0];
  const sourceIdentity = session.sourceIdentities[candidate.id];

  assert.ok(addition);
  assert.ok(provenance);
  assert.ok(sourceIdentity);

  const expectedTransactionId = stableImportTransactionId(
    candidate,
    session.file.fileHash!,
  );

  assert.equal(addition.id, expectedTransactionId);
  assert.equal(provenance.transactionId, expectedTransactionId);
  assert.equal(provenance.fileType, "csv");
  assert.equal(provenance.identity, sourceIdentity.identity);
  assert.equal(provenance.occurrence, sourceIdentity.occurrence);
});

test("matched candidate provenance targets the existing register transaction", () => {
  const candidate = matchedCandidate();
  const session = matchedSession(candidate);

  const plan = prepareImportCommit(session);
  const provenance = plan.provenanceAssignments[0];

  assert.ok(provenance);
  assert.equal(plan.additions.length, 0);
  assert.equal(
    provenance.transactionId,
    candidate.matchedTransaction?.id,
  );
});

test("matched candidate with no register-field edit still commits provenance through the atomic batch", async () => {
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
    keyValueStorage: createMemoryStorage(),
  } as never);

  try {
    const candidate = matchedCandidate();
    const session = matchedSession(candidate);

    let batchCalls = 0;
    let capturedUpdates: readonly RegisterTransactionView[] = [];
    let capturedProvenance:
      | readonly {
          transactionId: string;
          fileType: "csv" | "qif" | "ofx" | "qfx";
          identity: string;
          occurrence: number;
          importedAt: string;
        }[]
      | undefined;

    const result = await commitImportSession(session, {
      commitTransactionBatch: async (
        _accountId,
        _additions,
        updates,
        provenanceAssignments,
      ) => {
        batchCalls += 1;
        capturedUpdates = updates;
        capturedProvenance = provenanceAssignments;
      },
      addTransactions: async () => {
        assert.fail("legacy add path must not run");
      },
      updateTransactions: async () => {
        assert.fail("legacy update path must not run");
      },
    });

    assert.equal(
      result.matchedTransactionUpdates.length,
      0,
      "the matched transaction is already financially identical",
    );
    assert.equal(capturedUpdates.length, 0);
    assert.equal(batchCalls, 1);
    assert.equal(capturedProvenance?.length, 1);
    assert.equal(
      capturedProvenance?.[0]?.transactionId,
      candidate.matchedTransaction?.id,
    );
  } finally {
    resetBudgetPersistenceProvider();
  }
});

test("missing prepared source identity fails before any register mutation begins", async () => {
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
    keyValueStorage: createMemoryStorage(),
  } as never);

  try {
    const candidate = newCandidate();
    const session = {
      ...importedSession(candidate),
      sourceIdentities: {},
    };

    let batchCalls = 0;
    let addCalls = 0;
    let updateCalls = 0;

    await assert.rejects(
      () =>
        commitImportSession(session, {
          commitTransactionBatch: async () => {
            batchCalls += 1;
          },
          addTransactions: async () => {
            addCalls += 1;
          },
          updateTransactions: async () => {
            updateCalls += 1;
          },
        }),
      (error) => {
        assert.ok(error instanceof ImportCommitExecutionError);
        assert.equal(error.audit.failedStage, "Prepare import commit");
        assert.equal(error.audit.registerMutationStarted, false);
        return true;
      },
    );

    assert.equal(batchCalls, 0);
    assert.equal(addCalls, 0);
    assert.equal(updateCalls, 0);
  } finally {
    resetBudgetPersistenceProvider();
  }
});
