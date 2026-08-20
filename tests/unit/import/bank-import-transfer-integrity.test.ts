import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareImportCommit,
  verifyImportCommitPlan,
  type ImportCommitSession,
} from "../../../apps/web/src/features/accounts/importCommitEngine.js";
import {
  toTransactionWriteInput,
} from "../../../apps/web/src/features/accounts/useAccountRegister.js";
import {
  createEmptyMerchantKnowledgeStore,
} from "../../../apps/web/src/features/accounts/merchantKnowledge.js";
import type {
  TransactionImportCandidate,
} from "../../../apps/web/src/features/accounts/transactionImport.js";
import {
  buildTransactionImportSourceIdentities,
} from "../../../apps/web/src/features/accounts/transactionImportKnowledge.js";

function transferCandidate(): TransactionImportCandidate {
  return {
    id: "row-2",
    parsed: {
      rowNumber: 2,
      date: "2026-08-12",
      payee: "Transfer to Savings",
      inflow: 0,
      outflow: 100,
      raw: {},
    },
    status: "new",
    reason: "new transaction",
    selected: true,
    errors: [],
    lifecycle: {
      source: {
        rowNumber: 2,
        date: "2026-08-12",
        rawPayee: "Transfer to Savings",
        inflow: 0,
        outflow: 100,
      },
      merchant: {
        canonicalPayee: "Transfer to Savings",
        suggestedCategoryName: null,
        transferAccountName: "Savings",
      },
      proposal: {
        payee: "Transfer to Savings",
        categoryName: null,
        transferAccountName: "Savings",
      },
    },
  };
}

test("bank import commit plan carries the destination account ID for a transfer", () => {
  const candidate = transferCandidate();

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
    accounts: [
      { id: "checking", name: "Checking" },
      { id: "savings", name: "Savings" },
    ],
    merchantKnowledge: createEmptyMerchantKnowledgeStore(),
    file: {
      fileType: "csv",
      fileName: "transfer.csv",
      fileHash: "sha256:transfer-fixture",
    },
  };

  const plan = prepareImportCommit(session);
  const [transaction] = plan.additions;

  assert.ok(transaction);
  assert.equal(transaction.outflow, 100);
  assert.equal(transaction.inflow, 0);
  assert.equal(transaction.category, "Transfer");
  assert.equal(transaction.payee, "Transfer: Savings");

  assert.equal(
    transaction.transferAccountId,
    "savings",
    "a bank-imported transfer must carry the destination account ID so SQLite creates the reciprocal side",
  );

  const write = toTransactionWriteInput(transaction);
  assert.equal(
    write.transferAccountId,
    "savings",
    "the register adapter must forward the transfer destination into SQLite",
  );
});


test("bank import verifier rejects transfer metadata that does not match the named destination", () => {
  const candidate = transferCandidate();

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
    accounts: [
      { id: "checking", name: "Checking" },
      { id: "savings", name: "Savings" },
      { id: "offset", name: "Offset" },
    ],
    merchantKnowledge: createEmptyMerchantKnowledgeStore(),
    file: {
      fileType: "csv",
      fileName: "transfer.csv",
      fileHash: "sha256:transfer-fixture",
    },
  };

  const plan = prepareImportCommit(session);
  const addition = plan.additions[0];
  assert.ok(addition);

  const verification = verifyImportCommitPlan(session, {
    additions: [
      {
        ...addition,
        transferAccountId: "offset",
      },
    ],
    matchedTransactionUpdates: plan.matchedTransactionUpdates,
  });

  assert.equal(verification.valid, false);
  assert.ok(
    verification.issues.some((issue) => issue.code === "invalid-transfer"),
  );
});
