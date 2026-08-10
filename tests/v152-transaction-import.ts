import assert from "node:assert/strict";

import {
  buildRegisterTransactionsFromImport,
  parseTransactionCsv,
  previewTransactionCsvImport,
} from "../apps/web/src/features/accounts/transactionImport.js";
import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes.js";

const existingTransactions: RegisterTransactionView[] = [
  createTransaction({
    id: "manual-coles",
    date: "2026-06-01",
    payee: "Coles",
    outflow: 125.4,
  }),
  createTransaction({
    id: "manual-fuel",
    date: "2026-06-01",
    payee: "Fuel",
    outflow: 80,
  }),
];

const csv = [
  "Date,Description,Amount,Memo",
  "2026-06-03,COLES SUPERMARKET,-125.40,Settled later",
  "2026-06-08,Fuel Station,-80.00,Possible delayed settlement",
  "2026-06-10,Salary,2500.00,Payroll",
  "2026-06-11,Coffee Shop,-5.50,Morning coffee",
  "not-a-date,,0,Broken row",
].join("\n");

const parsed = parseTransactionCsv(csv);
assert.equal(parsed.length, 5, "CSV parser should return data rows");
assert.equal(parsed[0]?.date, "2026-06-03", "ISO dates should parse");
assert.equal(parsed[0]?.outflow, 125.4, "negative amount should become outflow");
assert.equal(parsed[2]?.inflow, 2500, "positive amount should become inflow");

const preview = previewTransactionCsvImport(csv, existingTransactions);
assert.equal(preview.summary.totalRows, 5, "preview should include all candidate rows");
assert.equal(preview.summary.exactMatches, 2, "same amount within the deterministic seven-day window should match");
assert.equal(preview.summary.possibleMatches, 0, "the reconciler no longer creates confidence-based possible matches");
assert.equal(preview.summary.newTransactions, 2, "two rows should be new transactions");
assert.equal(preview.summary.invalidRows, 1, "one row should be invalid");
assert.equal(preview.summary.selectedForImport, 2, "only new rows should be selected by default");

const exactMatch = preview.candidates.find((candidate) => candidate.parsed.payee === "COLES SUPERMARKET");
assert.equal(exactMatch?.status, "exact-match", "manual transaction settling two days later should be matched");
assert.equal(exactMatch?.selected, false, "matched rows should not import as duplicates");

const delayedMatch = preview.candidates.find((candidate) => candidate.parsed.payee === "Fuel Station");
assert.equal(delayedMatch?.status, "exact-match", "same amount seven days later should use the unified reconciliation window");
assert.equal(delayedMatch?.selected, false, "matched rows should not import automatically");

const imported = buildRegisterTransactionsFromImport(preview.candidates);
assert.equal(imported.length, 2, "only selected new rows should become register inputs");
assert.deepEqual(
  imported.map((transaction) => [transaction.date, transaction.payee, transaction.category, transaction.inflow, transaction.outflow]),
  [
    ["2026-06-10", "Salary", "Ready to Assign", 2500, 0],
    ["2026-06-11", "Coffee Shop", "Uncategorised", 0, 5.5],
  ],
  "import builder should create income and spending transactions with safe default categories",
);

console.log("v1.52 transaction import checks passed");

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
    flag: null,
    attachmentCount: 0,
    attachments: [],
    payee: input.payee,
    category: "Uncategorised",
    memo: undefined,
    inflow: input.inflow ?? 0,
    outflow: input.outflow ?? 0,
    runningBalance: 0,
    cleared: false,
    reconciled: false,
  };
}
