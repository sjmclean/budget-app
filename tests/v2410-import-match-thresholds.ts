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

assert.equal(HIGH_CONFIDENCE_IMPORT_MATCH_DAYS, 5);
assert.equal(SUGGESTED_IMPORT_MATCH_DAYS, 10);

const existingTransactions: RegisterTransactionView[] = [
  createTransaction({
    id: "manual-five-day-delay",
    date: "2026-06-01",
    payee: "Manual Groceries",
    outflow: 42.5,
  }),
  createTransaction({
    id: "manual-ten-day-delay",
    date: "2026-06-01",
    payee: "Manual Fuel",
    outflow: 88.1,
  }),
  createTransaction({
    id: "manual-eleven-day-delay",
    date: "2026-06-01",
    payee: "Manual Hardware",
    outflow: 19.99,
  }),
];

const csv = [
  "Date,Description,Amount",
  "2026-06-06,BANK GROCERIES,-42.50",
  "2026-06-11,BANK FUEL,-88.10",
  "2026-06-12,BANK HARDWARE,-19.99",
].join("\n");

const preview = previewTransactionCsvImport(csv, existingTransactions);
const byPayee = new Map(preview.candidates.map((candidate) => [candidate.parsed.payee, candidate]));

assert.equal(
  byPayee.get("BANK GROCERIES")?.status,
  "exact-match",
  "same amount within five days should be treated as a high-confidence match",
);
assert.equal(
  byPayee.get("BANK FUEL")?.status,
  "possible-match",
  "same amount within ten days should be treated as a suggested/possible match",
);
assert.equal(
  byPayee.get("BANK HARDWARE")?.status,
  "new",
  "same amount outside ten days should be treated as a new transaction",
);

assert.equal(preview.summary.exactMatches, 1);
assert.equal(preview.summary.possibleMatches, 1);
assert.equal(preview.summary.newTransactions, 1);
assert.equal(preview.summary.selectedForImport, 1);

console.log("v2.41.0 import match threshold checks passed");
