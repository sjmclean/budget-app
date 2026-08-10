import assert from "node:assert/strict";
import { installInMemoryBudgetPersistence } from "./support/persistence/inMemoryBudgetPersistence.js";
import {
  createImportedTransactionIdentity,
  partitionPreviouslyImportedCandidates,
  rememberImportedTransactionCandidates,
} from "../apps/web/src/features/accounts/transactionImportKnowledge";

type Candidate = {
  id: string;
  parsed: {
    date: string;
    payee: string;
    memo?: string;
    importedCategoryName?: string;
    transferAccountName?: string;
    outflow: number;
    inflow: number;
    raw: Record<string, string>;
  };
};

const { cleanup } = installInMemoryBudgetPersistence();

try {
function qifCandidate(id: string, memo = "CARD"): Candidate {
  return {
    id,
    parsed: {
      date: "2026-07-10",
      payee: "ALDI 1234",
      memo,
      outflow: 45.67,
      inflow: 0,
      raw: {
        date: "10/07/26",
        amount: "-45.67",
        payee: "ALDI 1234",
        memo,
      },
    },
  };
}

const first = qifCandidate("qif-1");
rememberImportedTransactionCandidates({
  accountId: "checking",
  fileType: "qif",
  candidates: [first],
  importedAt: "2026-07-10T00:00:00.000Z",
});

const qifResult = partitionPreviouslyImportedCandidates({
  accountId: "checking",
  fileType: "qif",
  candidates: [qifCandidate("qif-overlap"), qifCandidate("qif-new", "OTHER")],
});
assert.deepEqual(qifResult.previouslyImportedCandidates.map((entry) => entry.id), ["qif-overlap"]);
assert.deepEqual(qifResult.activeCandidates.map((entry) => entry.id), ["qif-new"]);

const duplicateA = qifCandidate("duplicate-a", "SAME");
const duplicateB = qifCandidate("duplicate-b", "SAME");
rememberImportedTransactionCandidates({
  accountId: "duplicates",
  fileType: "qif",
  candidates: [duplicateA],
});
const duplicateResult = partitionPreviouslyImportedCandidates({
  accountId: "duplicates",
  fileType: "qif",
  candidates: [duplicateA, duplicateB],
});
assert.deepEqual(duplicateResult.previouslyImportedCandidates.map((entry) => entry.id), ["duplicate-a"]);
assert.deepEqual(duplicateResult.activeCandidates.map((entry) => entry.id), ["duplicate-b"]);

const ofxOne: Candidate = {
  ...qifCandidate("ofx-1"),
  parsed: {
    ...qifCandidate("ofx-1").parsed,
    raw: { fitId: "FIT-123", postedDate: "20260710", amount: "-45.67", name: "ALDI" },
  },
};
const ofxTwo: Candidate = {
  ...qifCandidate("ofx-2"),
  parsed: {
    ...qifCandidate("ofx-2").parsed,
    raw: { fitId: "FIT-123", postedDate: "DIFFERENT", amount: "-999", name: "OTHER" },
  },
};
assert.equal(
  createImportedTransactionIdentity("ofx", ofxOne),
  createImportedTransactionIdentity("ofx", ofxTwo),
  "OFX identity should prefer FITID",
);

const otherAccountResult = partitionPreviouslyImportedCandidates({
  accountId: "savings",
  fileType: "qif",
  candidates: [qifCandidate("other-account")],
});
assert.equal(otherAccountResult.previouslyImportedCandidates.length, 0);
assert.equal(otherAccountResult.activeCandidates.length, 1);

console.log("v3.18.2 previously imported transaction exclusion checks passed");
} finally {
  cleanup();
}
