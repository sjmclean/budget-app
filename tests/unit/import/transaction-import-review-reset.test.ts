import assert from "node:assert/strict";
import test from "node:test";

import type { TransactionImportCandidate } from "../../../apps/web/src/features/accounts/transactionImport.js";
import {
  capturePreparedTransactionImportCandidates,
  hasTransactionImportCandidateChanges,
  resetTransactionImportCandidate,
} from "../../../apps/web/src/features/accounts/transactionImportReviewReset.js";
import { getRegisterMatchOwnership } from "../../../apps/web/src/features/accounts/transactionImportReviewOwnership.js";

function candidate(id: string, payee: string, categoryName: string): TransactionImportCandidate {
  return {
    id,
    parsed: { rowNumber: 1, date: "2026-09-01", payee: "RAW QIF SHOP", memo: "QIF memo", outflow: 20, inflow: 0, raw: {} },
    status: "new",
    reason: "Review",
    selected: true,
    errors: [],
    lifecycle: {
      source: { rowNumber: 1, date: "2026-09-01", rawPayee: "RAW QIF SHOP", memo: "QIF memo", outflow: 20, inflow: 0 },
      merchant: {
        canonicalPayee: payee,
        suggestedCategoryName: categoryName,
        transferAccountName: null,
        recognitionProvenance: "exact-alias",
        recognitionReason: "Exact learned alias or canonical payee",
      },
      proposal: { payee, categoryName, transferAccountName: null },
    },
  };
}

function reset(
  current: TransactionImportCandidate[],
  prepared: Record<string, TransactionImportCandidate>,
  candidateId = "a",
) {
  return resetTransactionImportCandidate({
    candidates: current,
    candidateId,
    preparedCandidates: prepared,
    manualEdits: { a: { payee: true, category: true }, b: { payee: true } },
    historicalUpdates: [
      { transaction: { id: "history-a" } as never, payee: "Edited A", sourceCandidateId: "a" },
      { transaction: { id: "history-b" } as never, payee: "Edited B", sourceCandidateId: "b" },
    ],
    matchEditorOrigins: {},
    matchedTransactionOrigins: {},
    ownership: getRegisterMatchOwnership({ candidates: current, processedCandidates: [] }),
  });
}

test("payee and category reset restores the initially prepared QIF recognition and isolates siblings", () => {
  const originalA = candidate("a", "Canonical Shop", "Groceries");
  const originalB = candidate("b", "Other Shop", "Dining");
  const prepared = capturePreparedTransactionImportCandidates([originalA, originalB]);
  const editedA = {
    ...originalA,
    lifecycle: { ...originalA.lifecycle, proposal: { ...originalA.lifecycle.proposal, payee: "Edited A", categoryName: "Fun" } },
  };
  const editedB = {
    ...originalB,
    lifecycle: { ...originalB.lifecycle, proposal: { ...originalB.lifecycle.proposal, payee: "Edited B" } },
  };

  assert.equal(hasTransactionImportCandidateChanges({
    candidate: editedA,
    preparedCandidate: prepared.a,
    manualEdits: { payee: true, category: true },
    hasMatchEditorOrigin: false,
    hasMatchedTransactionOrigin: false,
    historicalUpdates: [],
  }), true);

  const result = reset([editedA, editedB], prepared);
  assert.ok(result && !result.conflict);
  assert.deepEqual(result.candidates[0], originalA);
  assert.equal(result.candidates[0]?.lifecycle.source.rawPayee, "RAW QIF SHOP");
  assert.equal(result.candidates[0]?.lifecycle.proposal.payee, "Canonical Shop");
  assert.equal(result.candidates[0]?.lifecycle.proposal.categoryName, "Groceries");
  assert.equal(result.candidates[1], editedB);
  assert.equal(result.manualEdits.a, undefined);
  assert.deepEqual(result.manualEdits.b, { payee: true });
  assert.deepEqual(result.historicalUpdates.map((entry) => entry.sourceCandidateId), ["b"]);
});

test("reset replaces created or edited split state with the exact prepared split shape", () => {
  const originalNonSplit = candidate("a", "Canonical Shop", "Groceries");
  const preparedNonSplit = capturePreparedTransactionImportCandidates([originalNonSplit]);
  const createdSplit = {
    ...originalNonSplit,
    lifecycle: { ...originalNonSplit.lifecycle, proposal: {
      ...originalNonSplit.lifecycle.proposal,
      categoryName: "Split",
      splitLines: [
        { id: "one", category: "Groceries", outflow: 10, inflow: 0 },
        { id: "two", category: "Dining", outflow: 10, inflow: 0 },
      ],
    } },
  };
  const nonSplitResult = reset([createdSplit], preparedNonSplit);
  assert.ok(nonSplitResult && !nonSplitResult.conflict);
  assert.equal(nonSplitResult.candidates[0]?.lifecycle.proposal.categoryName, "Groceries");
  assert.equal(nonSplitResult.candidates[0]?.lifecycle.proposal.splitLines, undefined);

  const originalSplit = createdSplit;
  const preparedSplit = capturePreparedTransactionImportCandidates([originalSplit]);
  const editedSplit = {
    ...originalSplit,
    lifecycle: { ...originalSplit.lifecycle, proposal: { ...originalSplit.lifecycle.proposal,
      splitLines: originalSplit.lifecycle.proposal.splitLines?.map((line, index) => index === 0 ? { ...line, outflow: 12 } : { ...line, outflow: 8 }),
    } },
  };
  const splitResult = reset([editedSplit], preparedSplit);
  assert.ok(splitResult && !splitResult.conflict);
  assert.deepEqual(splitResult.candidates[0]?.lifecycle.proposal.splitLines, originalSplit.lifecycle.proposal.splitLines);
});

test("reset refuses to reclaim an original register match owned by another candidate", () => {
  const register = { id: "register-1", date: "2026-09-01", payee: "Canonical Shop", category: "Groceries", outflow: 20, inflow: 0, runningBalance: 0, cleared: true, reconciled: false, attachmentCount: 0 };
  const original = { ...candidate("a", "Canonical Shop", "Groceries"), status: "exact-match" as const, matchedTransactionId: register.id, matchedTransaction: register };
  const owner = { ...candidate("b", "Other", "Dining"), status: "exact-match" as const, matchedTransactionId: register.id, matchedTransaction: register };
  const current = { ...original, status: "new" as const, matchedTransactionId: undefined, matchedTransaction: undefined };
  const result = resetTransactionImportCandidate({
    candidates: [current, owner], candidateId: "a",
    preparedCandidates: capturePreparedTransactionImportCandidates([original, owner]),
    manualEdits: {}, historicalUpdates: [], matchEditorOrigins: {}, matchedTransactionOrigins: {},
    ownership: getRegisterMatchOwnership({ candidates: [current, owner], processedCandidates: [] }),
  });
  assert.deepEqual(result, { conflict: true });
});
