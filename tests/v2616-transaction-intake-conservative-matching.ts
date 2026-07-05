import assert from "node:assert/strict";

import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes.js";
import { previewTransactionCsvImport } from "../apps/web/src/features/accounts/transactionImport.js";

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

const existingTransactions: RegisterTransactionView[] = [
  createTransaction({
    id: "bakers-delight",
    date: "2026-06-26",
    payee: "Bakers Delight",
    outflow: 6,
  }),
  createTransaction({
    id: "afl-record",
    date: "2026-06-28",
    payee: "AFL Record Southbank",
    outflow: 6,
  }),
];

const unrelatedPreview = previewTransactionCsvImport(
  ["Date,Description,Amount", "2026-06-30,AFL RECORD SOUTHBANK,-6.00"].join("\n"),
  [existingTransactions[0]],
);
const unrelatedCandidate = unrelatedPreview.candidates[0];
assert.equal(
  unrelatedCandidate.status,
  "new",
  "same amount and nearby date alone must not create a duplicate match",
);
assert.match(
  unrelatedCandidate.reason,
  /No suitable match found|not enough evidence/i,
  "new transaction should explain that no suitable match evidence was found",
);
assert.equal(
  typeof unrelatedCandidate.confidence,
  "number",
  "new transaction should still include matching confidence context",
);

const relatedPreview = previewTransactionCsvImport(
  ["Date,Description,Amount", "2026-06-30,AFL RECORD SOUTHBANK,-6.00"].join("\n"),
  [existingTransactions[1]],
);
const relatedCandidate = relatedPreview.candidates[0];
assert.equal(
  relatedCandidate.status,
  "exact-match",
  "same amount, nearby date, and similar payee should remain a confident match",
);
assert.ok(
  (relatedCandidate.confidence ?? 0) >= 85,
  "confident matches should expose a high confidence score",
);
assert.ok(
  (relatedCandidate.evidence ?? []).some((item) => item.label === "Payee"),
  "match analysis should include payee evidence",
);

console.log("v2.61.6 transaction intake conservative matching checks passed");
