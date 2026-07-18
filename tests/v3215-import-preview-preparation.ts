import assert from "node:assert/strict";
import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes";
import type { TransactionImportCandidate } from "../apps/web/src/features/accounts/transactionImport";
import {
  applyMerchantProposals,
  prepareTransactionImportPreview,
  recoverExactDuplicateFileCandidates,
} from "../apps/web/src/features/accounts/transactionImportPreviewPreparation";

function candidate(input: {
  id: string;
  payee: string;
  date?: string;
  outflow?: number;
  inflow?: number;
  status?: TransactionImportCandidate["status"];
  categoryName?: string | null;
  suggestedCategoryName?: string | null;
}): TransactionImportCandidate {
  const date = input.date ?? "2026-07-16";
  const outflow = input.outflow ?? 10;
  const inflow = input.inflow ?? 0;
  const status = input.status ?? "new";
  return {
    id: input.id,
    parsed: {
      rowNumber: 1,
      date,
      payee: input.payee,
      outflow,
      inflow,
      raw: {},
    },
    status,
    reason: "test",
    selected: status === "new",
    errors: [],
    lifecycle: {
      source: {
        rowNumber: 1,
        date,
        rawPayee: input.payee,
        outflow,
        inflow,
      },
      merchant: {
        canonicalPayee: input.payee.replace(/\s+\d+$/, ""),
        suggestedCategoryName: input.suggestedCategoryName ?? null,
        transferAccountName: null,
      },
      proposal: {
        payee: input.payee,
        categoryName: input.categoryName ?? null,
        transferAccountName: null,
      },
    },
  };
}

function registerTransaction(input: {
  id: string;
  payee: string;
  date?: string;
  outflow?: number;
  inflow?: number;
}): RegisterTransactionView {
  return {
    id: input.id,
    date: input.date ?? "2026-07-16",
    payee: input.payee,
    category: "Groceries",
    outflow: input.outflow ?? 10,
    inflow: input.inflow ?? 0,
    runningBalance: 0,
    cleared: false,
    reconciled: false,
    attachmentCount: 0,
  };
}

const merchantApplied = applyMerchantProposals([
  candidate({
    id: "merchant",
    payee: "Aldi 123",
    suggestedCategoryName: "Groceries",
  }),
]);
assert.equal(merchantApplied[0]?.lifecycle.proposal.payee, "Aldi");
assert.equal(merchantApplied[0]?.lifecycle.proposal.categoryName, "Groceries");

const duplicateCandidates = [
  candidate({ id: "one", payee: "Aldi" }),
  candidate({ id: "two", payee: "Aldi" }),
  candidate({ id: "three", payee: "Aldi" }),
];
const recovered = recoverExactDuplicateFileCandidates({
  candidates: duplicateCandidates,
  existingTransactions: [
    registerTransaction({ id: "register-one", payee: "  ALDI " }),
    registerTransaction({ id: "register-two", payee: "Aldi" }),
  ],
  isExactDuplicateFile: true,
});
assert.deepEqual(
  recovered.representedCandidates.map((item) => item.id),
  ["one", "two"],
  "duplicate recovery must consume identical register occurrences one-for-one",
);
assert.deepEqual(
  recovered.reviewCandidates.map((item) => item.id),
  ["three"],
);

const invalid = candidate({ id: "invalid", payee: "", status: "invalid" });
const prepared = prepareTransactionImportPreview({
  partition: {
    activeCandidates: [...duplicateCandidates, invalid],
    previouslyImportedCandidates: [candidate({ id: "identity", payee: "Old" })],
    alreadyRepresentedCandidates: [candidate({ id: "represented", payee: "Old" })],
  },
  existingTransactions: [
    registerTransaction({ id: "register-one", payee: "Aldi" }),
    registerTransaction({ id: "register-two", payee: "Aldi" }),
  ],
  isExactDuplicateFile: true,
});
assert.equal(prepared.previouslyImportedCount, 1);
assert.equal(prepared.alreadyRepresentedCount, 3);
assert.equal(prepared.totalExistingCount, 4);
assert.equal(prepared.preview.summary.totalRows, 2);
assert.equal(prepared.preview.summary.newTransactions, 1);
assert.equal(prepared.preview.summary.invalidRows, 1);
assert.deepEqual(Object.keys(prepared.bankCandidateDetails), [
  "one",
  "two",
  "three",
  "invalid",
]);

console.log("v3.21.5 import preview preparation checks passed");
