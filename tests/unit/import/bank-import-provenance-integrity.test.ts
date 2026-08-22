import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  commitImportSession,
  ImportCommitExecutionError,
  prepareImportCommit,
  verifyImportCommitPlan,
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


test("payee resolution preserves the stable imported transaction ID and provenance target", async () => {
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
    const session = importedSession(candidate);

    let capturedAdditionId: string | undefined;
    let capturedProvenanceTransactionId: string | undefined;
    let resolveCalls = 0;

    await commitImportSession(session, {
      resolvePayee: async (name) => {
        resolveCalls += 1;
        assert.equal(name, "Example Merchant");
        return {
          id: "payee-example",
          name: "Example Merchant",
        };
      },
      commitTransactionBatch: async (
        _accountId,
        additions,
        _updates,
        provenanceAssignments,
      ) => {
        assert.equal(additions.length, 1);
        assert.equal(provenanceAssignments.length, 1);

        capturedAdditionId = additions[0]?.id;
        capturedProvenanceTransactionId =
          provenanceAssignments[0]?.transactionId;

        assert.equal(additions[0]?.payeeId, "payee-example");
      },
      addTransactions: async () => {
        assert.fail("legacy add path must not run");
      },
      updateTransactions: async () => {
        assert.fail("legacy update path must not run");
      },
    });

    const expectedTransactionId = stableImportTransactionId(
      candidate,
      session.file.fileHash!,
    );

    assert.equal(resolveCalls, 1);
    assert.equal(capturedAdditionId, expectedTransactionId);
    assert.equal(
      capturedProvenanceTransactionId,
      expectedTransactionId,
    );
  } finally {
    resetBudgetPersistenceProvider();
  }
});

test("repeated unknown payee resolutions share one in-flight creation", async () => {
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
    const first = newCandidate();
    const second: TransactionImportCandidate = {
      ...newCandidate(),
      id: "row-3",
      parsed: {
        ...newCandidate().parsed,
        rowNumber: 3,
      },
      lifecycle: {
        ...newCandidate().lifecycle,
        source: {
          ...newCandidate().lifecycle.source,
          rowNumber: 3,
        },
      },
    };

    const fileHash = "sha256:shared-payee-fixture";
    const candidates = [first, second];

    const session: ImportCommitSession = {
      ...importedSession(first),
      importedCandidates: candidates,
      completedSourceCandidates: candidates,
      sourceIdentities: buildTransactionImportSourceIdentities(
        "csv",
        candidates,
      ),
      file: {
        ...importedSession(first).file,
        fileHash,
      },
    };

    let resolveCalls = 0;

    await commitImportSession(session, {
      resolvePayee: async () => {
        resolveCalls += 1;

        await new Promise((resolve) => setTimeout(resolve, 10));

        return {
          id: "payee-example",
          name: "Example Merchant",
        };
      },
      commitTransactionBatch: async (
        _accountId,
        additions,
        _updates,
        provenanceAssignments,
      ) => {
        assert.equal(additions.length, 2);
        assert.equal(provenanceAssignments.length, 2);
        assert.equal(additions[0]?.payeeId, "payee-example");
        assert.equal(additions[1]?.payeeId, "payee-example");
      },
      addTransactions: async () => {
        assert.fail("legacy add path must not run");
      },
      updateTransactions: async () => {
        assert.fail("legacy update path must not run");
      },
    });

    assert.equal(
      resolveCalls,
      1,
      "identical unresolved payees must share one in-flight resolution",
    );
  } finally {
    resetBudgetPersistenceProvider();
  }
});

test("commit-plan verification rejects addition and provenance identity divergence", () => {
  const candidate = newCandidate();
  const session = importedSession(candidate);
  const plan = prepareImportCommit(session);
  const addition = plan.additions[0];

  assert.ok(addition);

  const corruptedTransactionId = "import-corrupted-row-2";
  const verification = verifyImportCommitPlan(session, {
    additions: [
      {
        ...addition,
        id: corruptedTransactionId,
      },
    ],
    matchedTransactionUpdates: plan.matchedTransactionUpdates,
    provenanceAssignments: plan.provenanceAssignments,
    payeeCreations: plan.payeeCreations,
  });

  assert.equal(verification.valid, false);
  assert.ok(
    verification.issues.some(
      (issue) =>
        issue.code === "invalid-import-identity" &&
        issue.candidateId === candidate.id,
    ),
    "the expected stable transaction ID must remain represented by the additions",
  );
  assert.ok(
    verification.issues.some(
      (issue) =>
        issue.code === "invalid-import-identity" &&
        issue.transactionId === plan.provenanceAssignments[0]?.transactionId,
    ),
    "provenance must not target a transaction absent from the prepared additions",
  );
});

test("planned import transaction identity is enumerable and survives object spread", () => {
  const candidate = newCandidate();
  const session = importedSession(candidate);
  const plan = prepareImportCommit(session);
  const addition = plan.additions[0];

  assert.ok(addition);
  assert.ok(addition.id);

  const descriptor = Object.getOwnPropertyDescriptor(addition, "id");

  assert.equal(descriptor?.enumerable, true);
  assert.equal(
    { ...addition }.id,
    addition.id,
    "ordinary submission transformations must preserve import identity",
  );
});


test("provenance-bearing register batch rejects additions without stable IDs", () => {
  const source = fs.readFileSync(
    new URL(
      "../../../apps/web/src/features/accounts/useAccountRegister.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    source,
    /provenanceAssignments\.length > 0/,
  );
  assert.match(
    source,
    /additions\.find\([\s\S]*?!transaction\.id\?\.trim\(\)/,
  );
  assert.match(
    source,
    /An imported transaction lost its planned stable ID before persistence\./,
  );
});
