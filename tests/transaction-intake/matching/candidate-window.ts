import assert from "node:assert/strict";

import type { RegisterTransactionView } from "../../../apps/web/src/features/accounts/accountRegisterTypes";
import {
  assessTransactionImportMatch,
  previewTransactionQifImport,
  TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS,
  type ParsedImportTransaction,
} from "../../../apps/web/src/features/accounts/transactionImport";

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

assert.equal(
  TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS,
  14,
  "candidate discovery should use a fixed 14-day transaction-relative window",
);

const ancientSameAmount = createTransaction({
  id: "ancient-same-amount",
  date: "2020-07-03",
  payee: "Woolworths",
  outflow: 6.54,
});
const imported = createImported({
  date: "2026-07-05",
  payee: "Woolworths Metro",
  outflow: 6.54,
});

const noCandidateAssessment = assessTransactionImportMatch(imported, [
  ancientSameAmount,
]);

assert.equal(noCandidateAssessment.status, "new");
assert.equal(noCandidateAssessment.recommendation, "import");
assert.equal(noCandidateAssessment.candidates.length, 0);
assert.equal(noCandidateAssessment.selectedCandidate, undefined);
assert.match(noCandidateAssessment.reason, /No reasonable candidate found within 14 days/);
assert.doesNotMatch(noCandidateAssessment.reason, /2192|same-amount candidate was/);

const inWindowSameAmount = createTransaction({
  id: "recent-same-amount",
  date: "2026-06-24",
  payee: "Bakers Delight",
  outflow: 6.54,
});

const inWindowAssessment = assessTransactionImportMatch(imported, [
  ancientSameAmount,
  inWindowSameAmount,
]);

assert.equal(inWindowAssessment.status, "new");
assert.equal(inWindowAssessment.candidates.length, 1);
assert.equal(inWindowAssessment.candidates[0].transaction.id, "recent-same-amount");
assert.match(inWindowAssessment.reason, /Closest in-window same-amount candidate/);

const qifPreview = previewTransactionQifImport(
  `D05/07/2026\nT-6.54\nPWoolworths Metro\n^`,
  [ancientSameAmount],
);

assert.equal(qifPreview.candidates[0].status, "new");
assert.equal(qifPreview.candidates[0].confidence, undefined);
assert.equal(qifPreview.candidates[0].matchCandidates?.length, 0);
assert.match(qifPreview.candidates[0].reason, /No reasonable candidate found within 14 days/);

console.log("v2.62.6 transaction intake candidate window checks passed");
