import assert from "node:assert/strict";

import {
  analyseTransactionCsvImport,
  parseTransactionCsv,
  previewTransactionCsvImport,
  type CsvImportColumnMapping,
} from "../apps/web/src/features/accounts/transactionImport.js";

const bankCsv = [
  "Date,Amount,Transaction Type,Transaction Details,Merchant Name,Balance,Category",
  "18 Jun 26,-12.50,EFTPOS PURCHASE,COLES 0657 GREENSBOROUGH,Coles (Greensborough Plaza),1234.56,Groceries",
  "19 Jun 26,500.00,CREDIT CARD PAYMENT,INTERNET PAYMENT Linked Acc Trns,,1734.56,Internal transfers",
].join("\n");

const mapping: CsvImportColumnMapping = {
  0: "date",
  1: "amount",
  2: "ignore",
  3: "memo",
  4: "payee",
  5: "balance",
  6: "ignore",
};

const parsed = parseTransactionCsv(bankCsv, mapping);
assert.equal(parsed.length, 2, "bank CSV should parse data rows");
assert.equal(parsed[0]?.date, "2026-06-18", "DD Mon YY bank dates should parse");
assert.equal(parsed[0]?.payee, "Coles (Greensborough Plaza)", "merchant should be used as primary payee when present");
assert.equal(parsed[0]?.memo, "COLES 0657 GREENSBOROUGH", "transaction details should remain available as memo");
assert.equal(parsed[0]?.outflow, 12.5, "negative signed amount should become outflow");

assert.equal(parsed[1]?.date, "2026-06-19", "transfer row date should parse");
assert.equal(parsed[1]?.payee, "INTERNET PAYMENT Linked Acc Trns", "memo should be used as payee fallback when merchant is blank");
assert.equal(parsed[1]?.memo, "INTERNET PAYMENT Linked Acc Trns", "fallback payee source should still remain as memo");
assert.equal(parsed[1]?.inflow, 500, "positive signed amount should become inflow");

const preview = previewTransactionCsvImport(bankCsv, [], mapping);
assert.equal(preview.summary.invalidRows, 0, "blank merchant transfer rows should not be invalid when memo fallback exists");
assert.equal(preview.summary.newTransactions, 2, "both valid rows should preview as new transactions");
assert.equal(preview.summary.selectedForImport, 2, "both valid new rows should be selected by default");

const explicitFallbackCsv = [
  "Date,Amount,Primary Description,Secondary Description,Memo",
  "2026-06-20,42.00,,Fallback Payee,Useful memo",
].join("\n");
const explicitFallbackMapping: CsvImportColumnMapping = {
  0: "date",
  1: "amount",
  2: "payee",
  3: "payeeFallback",
  4: "memo",
};
const explicitFallback = parseTransactionCsv(explicitFallbackCsv, explicitFallbackMapping);
assert.equal(explicitFallback[0]?.payee, "Fallback Payee", "explicit payee fallback should be preferred over memo fallback");
assert.equal(explicitFallback[0]?.memo, "Useful memo", "explicit fallback should not overwrite memo");

const analysis = analyseTransactionCsvImport(bankCsv);
assert.equal(analysis.totalDataRows, 2, "analysis should report data row count");
assert.ok(analysis.columns.some((column) => column.header === "Merchant Name"), "analysis should expose bank-specific columns for manual mapping");

console.log("v1.53 import column mapping fallback checks passed");
