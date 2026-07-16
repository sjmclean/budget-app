import assert from "node:assert/strict";
import {
  extractQifTransferAccountName as extractFromFacade,
  parseTransactionCsv as parseCsvFromFacade,
  parseTransactionQif as parseQifFromFacade,
} from "../apps/web/src/features/accounts/transactionImport";
import {
  extractQifTransferAccountName,
  parseTransactionCsv,
  parseTransactionQif,
} from "../apps/web/src/features/accounts/transactionImportParser";

const csv = [
  "Date,Payee,Amount,Memo",
  "01/07/2026,Grocer,-42.50,Weekly shop",
].join("\n");

assert.deepEqual(parseCsvFromFacade(csv), parseTransactionCsv(csv));

const qif = [
  "!Type:Bank",
  "D01/07/2026",
  "T-42.50",
  "PGrocer",
  "L[Everyday Savings]",
  "^",
].join("\n");

assert.deepEqual(
  parseQifFromFacade(qif, {
    dateFormat: "DD/MM/YYYY",
    amountFormat: "decimal-dot",
  }),
  parseTransactionQif(qif, {
    dateFormat: "DD/MM/YYYY",
    amountFormat: "decimal-dot",
  }),
);
assert.equal(
  extractFromFacade("[Everyday Savings]"),
  extractQifTransferAccountName("[Everyday Savings]"),
);
assert.equal(extractQifTransferAccountName("Groceries"), undefined);

console.log("v3.15.8 import parser extraction checks passed");
