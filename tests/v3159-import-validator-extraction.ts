import assert from "node:assert/strict";
import {
  validateParsedImportTransaction,
  validateParsedImportTransactionDiagnostics,
  validateQifTransferDestinations,
} from "../apps/web/src/features/accounts/transactionImportValidator";
import type { TransactionImportPreview } from "../apps/web/src/features/accounts/transactionImport";

const valid = {
  rowNumber: 2,
  date: "2026-07-16",
  payee: "Example",
  outflow: 12.34,
  inflow: 0,
  raw: {},
};
assert.deepEqual(validateParsedImportTransaction(valid), []);

const invalid = { ...valid, date: "", payee: "", outflow: 0 };
assert.deepEqual(validateParsedImportTransaction(invalid), [
  "Missing or invalid date.",
  "Missing payee/description.",
  "Missing amount.",
]);
assert.deepEqual(
  validateParsedImportTransactionDiagnostics(invalid).map(({ code }) => code),
  [
    "transaction.date.invalid",
    "transaction.payee.missing",
    "transaction.amount.missing",
  ],
);

const preview: TransactionImportPreview = {
  candidates: [
    {
      id: "row-2",
      parsed: { ...valid, transferAccountName: "Savings" },
      status: "new",
      reason: "New transaction.",
      selected: true,
      errors: [],
      lifecycle: {
        source: {
          rowNumber: valid.rowNumber,
          date: valid.date,
          rawPayee: valid.payee,
          transferAccountName: "Savings",
          outflow: valid.outflow,
          inflow: valid.inflow,
        },
        merchant: {
          canonicalPayee: "Transfer: Savings",
          suggestedCategoryName: null,
          transferAccountName: "Savings",
        },
        proposal: {
          payee: "Transfer: Savings",
          categoryName: null,
          transferAccountName: "Savings",
        },
      },
    },
  ],
  summary: {
    totalRows: 1,
    newTransactions: 1,
    exactMatches: 0,
    possibleMatches: 0,
    invalidRows: 0,
    selectedForImport: 1,
  },
};

const accepted = validateQifTransferDestinations(preview, {
  sourceAccountName: "Everyday",
  availableTransferAccountNames: ["Savings"],
});
assert.equal(accepted.candidates[0].status, "new");

const rejected = validateQifTransferDestinations(preview, {
  sourceAccountName: "Everyday",
  availableTransferAccountNames: [],
});
assert.equal(rejected.candidates[0].status, "invalid");
assert.equal(rejected.candidates[0].selected, false);
assert.equal(rejected.summary.invalidRows, 1);
assert.equal(rejected.summary.selectedForImport, 0);

console.log("v3.15.9 import validator extraction checks passed");
