import assert from "node:assert/strict";

import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes.js";
import {
  HIGH_CONFIDENCE_IMPORT_MATCH_DAYS,
  SUGGESTED_IMPORT_MATCH_DAYS,
  previewTransactionCsvImport,
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

assert.equal(HIGH_CONFIDENCE_IMPORT_MATCH_DAYS, 7);
assert.equal(SUGGESTED_IMPORT_MATCH_DAYS, 7);

const existingTransactions: RegisterTransactionView[] = [
  createTransaction({
    id: "manual-five-day-delay",
    date: "2026-06-01",
    payee: "Woolworths 1234",
    outflow: 42.5,
  }),
  createTransaction({
    id: "manual-ten-day-delay",
    date: "2026-06-01",
    payee: "Ampol Fuel",
    outflow: 88.1,
  }),
  createTransaction({
    id: "manual-eleven-day-delay",
    date: "2026-06-01",
    payee: "Bunnings Hardware",
    outflow: 19.99,
  }),
  createTransaction({
    id: "amount-only",
    date: "2026-06-06",
    payee: "Bakers Delight",
    outflow: 6,
  }),
];

const csv = [
  "Date,Description,Amount",
  "2026-06-06,WOOLWORTHS AU,-42.50",
  "2026-06-11,AMPOL FUEL AU,-88.10",
  "2026-06-12,BUNNINGS HARDWARE,-19.99",
  "2026-06-07,AFL RECORD SOUTHBANK,-6.00",
].join("\n");

const preview = previewTransactionCsvImport(csv, existingTransactions);
const byPayee = new Map(preview.candidates.map((candidate) => [candidate.parsed.payee, candidate]));

assert.equal(
  byPayee.get("WOOLWORTHS AU")?.status,
  "exact-match",
  "same amount within five days should only become high confidence when the payee is also similar",
);
assert.equal(
  byPayee.get("AMPOL FUEL AU")?.status,
  "possible-match",
  "same amount within ten days should become suggested only when payee evidence is plausible",
);
assert.equal(
  byPayee.get("BUNNINGS HARDWARE")?.status,
  "new",
  "same amount outside ten days should be treated as a new transaction",
);
assert.equal(
  byPayee.get("AFL RECORD SOUTHBANK")?.status,
  "new",
  "same amount and nearby date alone should not be enough to suggest a match",
);

assert.equal(preview.summary.exactMatches, 1);
assert.equal(preview.summary.possibleMatches, 1);
assert.equal(preview.summary.newTransactions, 2);
assert.equal(preview.summary.selectedForImport, 2);

console.log("v2.41.0 import match threshold checks passed");
