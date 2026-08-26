import assert from "node:assert/strict";
import test from "node:test";

import {
  commitImportSession,
  type ImportCommitSession,
} from "../../../apps/web/src/features/accounts/importCommitEngine.js";
import {
  createEmptyMerchantKnowledgeStore,
} from "../../../apps/web/src/features/accounts/merchantKnowledge.js";
import type {
  TransactionImportCandidate,
} from "../../../apps/web/src/features/accounts/transactionImport.js";
import {
  buildTransactionImportSourceIdentities,
} from "../../../apps/web/src/features/accounts/transactionImportKnowledge.js";
import {
  configureBudgetPersistenceProvider,
  resetBudgetPersistenceProvider,
} from "../../../apps/web/src/features/persistence/budgetPersistenceProviderFactory.js";

function throwingStorage() {
  return {
    getItem(_key: string) {
      return null;
    },
    setItem(_key: string, _value: string) {
      throw new Error("knowledge storage unavailable");
    },
    removeItem(_key: string) {},
    listKeys() {
      return [];
    },
  };
}

function candidate(): TransactionImportCandidate {
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
        "Transaction ID": "bank-knowledge-123",
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

test("optional post-commit knowledge failure does not turn a successful register commit into a failed import", async () => {
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
    keyValueStorage: throwingStorage(),
  } as never);

  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };

  try {
    const sourceCandidate = candidate();

    const session: ImportCommitSession = {
      accountId: "checking",
      accountName: "Checking",
      importedCandidates: [sourceCandidate],
      matchedCandidates: [],
      completedSourceCandidates: [sourceCandidate],
      sourceIdentities: buildTransactionImportSourceIdentities(
        "csv",
        [sourceCandidate],
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
        fileHash: "sha256:post-commit-knowledge-fixture",
      },
    };

    let batchCalls = 0;

    const result = await commitImportSession(session, {
      commitTransactionBatch: async () => {
        batchCalls += 1;
      },
      addTransactions: async () => {
        assert.fail("legacy add path must not run");
      },
      updateTransactions: async () => {
        assert.fail("legacy update path must not run");
      },
    });

    assert.equal(batchCalls, 1);
    assert.equal(result.audit.status, "completed");
    assert.equal(result.audit.failedStage, null);
    assert.equal(result.audit.errorMessage, null);
    assert.equal(result.audit.registerMutationStarted, true);
    assert.equal(result.audit.knowledgePersisted, false);
    assert.match(
      result.audit.knowledgePersistenceError ?? "",
      /knowledge storage unavailable/i,
    );

    assert.equal(warnings.length, 1);
    assert.equal(
      warnings[0]?.[0],
      "Transaction import committed successfully, but optional import knowledge could not be persisted.",
    );
    assert.match(
      warnings[0]?.[1] instanceof Error
        ? warnings[0][1].message
        : String(warnings[0]?.[1] ?? ""),
      /knowledge storage unavailable/i,
    );
  } finally {
    console.warn = originalWarn;
    resetBudgetPersistenceProvider();
  }
});
