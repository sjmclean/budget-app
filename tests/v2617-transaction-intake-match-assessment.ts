import assert from "node:assert/strict";

import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes.js";
import {
  assessTransactionImportMatch,
  type ParsedImportTransaction,
} from "../apps/web/src/features/accounts/transactionImport.js";

function createTransaction(input: {
  id: string;
  date: string;
  payee: string;
  outflow?: number;
  inflow?: number;
}): RegisterTransactionView {
  return {
    id: input.id,
    date: input.date,
    payee: input.payee,
    category: "Uncategorised",
    memo: "",
    checkNumber: "",
    outflow: input.outflow ?? 0,
    inflow: input.inflow ?? 0,
    cleared: false,
    reconciled: false,
    flag: null,
    attachmentCount: 0,
    runningBalance: 0,
  };
}

function createImported(input: {
  date: string;
  payee: string;
  outflow?: number;
  inflow?: number;
}): ParsedImportTransaction {
  return {
    rowNumber: 2,
    date: input.date,
    payee: input.payee,
    memo: "",
    outflow: input.outflow ?? 0,
    inflow: input.inflow ?? 0,
    raw: {},
  };
}

const unrelatedAssessment = assessTransactionImportMatch(
  createImported({ date: "2026-06-30", payee: "AFL RECORD SOUTHBANK", outflow: 6 }),
  [createTransaction({ id: "bakers", date: "2026-06-26", payee: "Bakers Delight", outflow: 6 })],
);

assert.equal(unrelatedAssessment.recommendation, "import");
assert.equal(unrelatedAssessment.status, "new");
assert.equal(unrelatedAssessment.candidates.length, 1);
assert.equal(unrelatedAssessment.selectedCandidate?.transaction.id, "bakers");
assert.ok(
  unrelatedAssessment.confidence < 60,
  "unrelated same-amount transactions should remain low confidence",
);
assert.ok(
  unrelatedAssessment.evidence?.some(
    (item) => item.label === "Payee" && item.result === "negative",
  ),
  "low-confidence assessments should preserve negative payee evidence",
);

const relatedAssessment = assessTransactionImportMatch(
  createImported({ date: "2026-06-30", payee: "AFL RECORD SOUTHBANK", outflow: 6 }),
  [createTransaction({ id: "afl", date: "2026-06-28", payee: "AFL Record Southbank", outflow: 6 })],
);

assert.equal(relatedAssessment.recommendation, "match");
assert.equal(relatedAssessment.status, "exact-match");
assert.equal(relatedAssessment.selectedCandidate?.transaction.id, "afl");
assert.ok(relatedAssessment.confidence >= 85);

console.log("v2.61.7 transaction intake match assessment checks passed");
