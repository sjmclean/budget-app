import assert from "node:assert/strict";
import { detectQifImportFormat, parseTransactionQif } from "../apps/web/src/features/accounts/transactionImport.js";

const au = `!Type:CCard\nD16/07/26\nT-14.22\nPShop\n^\nD15/07/26\nT500.00\nPPayment\n^`;
const detectedAu = detectQifImportFormat(au);
assert.equal(detectedAu.dateFormat, "DD/MM/YY");
assert.equal(detectedAu.dateFormatNeedsConfirmation, false);
assert.equal(detectedAu.amountFormat, "decimal-dot");
const auRows = parseTransactionQif(au, detectedAu);
assert.equal(auRows[0]?.date, "2026-07-16");
assert.equal(auRows[0]?.outflow, 14.22);

const us = `!Type:Bank\nD07/16/2026\nT-1,234.56\nPExample\n^`;
const detectedUs = detectQifImportFormat(us);
assert.equal(detectedUs.dateFormat, "MM/DD/YYYY");
assert.equal(parseTransactionQif(us, detectedUs)[0]?.date, "2026-07-16");
assert.equal(parseTransactionQif(us, detectedUs)[0]?.outflow, 1234.56);

const eu = `!Type:Bank\nD16-07-2026\nT-1.234,56\nPExample\n^`;
const detectedEu = detectQifImportFormat(eu);
assert.equal(detectedEu.dateFormat, "DD-MM-YYYY");
assert.equal(detectedEu.amountFormat, "decimal-comma");
assert.equal(parseTransactionQif(eu, detectedEu)[0]?.outflow, 1234.56);

const ambiguousDayFirst = detectQifImportFormat(
  `D03/04/26\nT10\nPExample\n^`,
  { preferredDateFormat: "DD/MM/YYYY" },
);
assert.equal(ambiguousDayFirst.dateFormatNeedsConfirmation, true);
assert.equal(ambiguousDayFirst.dateFormat, "DD/MM/YY");
assert.equal(ambiguousDayFirst.dateFormatSource, "application");

const ambiguousMonthFirst = detectQifImportFormat(
  `D03/04/26\nT10\nPExample\n^`,
  { preferredDateFormat: "MM/DD/YYYY" },
);
assert.equal(ambiguousMonthFirst.dateFormat, "MM/DD/YY");
assert.equal(ambiguousMonthFirst.dateFormatSource, "application");

const autoDetectedLegacyCaller = parseTransactionQif(
  `D30/06/2026\nT-20.00\nPLegacy caller\n^`,
);
assert.equal(autoDetectedLegacyCaller[0]?.date, "2026-06-30");

console.log("v3.15.5 QIF format detection checks passed");
