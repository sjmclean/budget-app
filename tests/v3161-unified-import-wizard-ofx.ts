import assert from "node:assert/strict";
import {
  inspectTransactionOfxImport,
  parseTransactionOfx,
  previewTransactionOfxImport,
} from "../apps/web/src/features/accounts/transactionImport";

const ofx = `OFXHEADER:100
DATA:OFXSGML

<OFX>
<CURDEF>AUD
<ACCTID>123456
<DTSTART>20260701000000
<DTEND>20260715000000
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260714120000
<TRNAMT>-42.50
<FITID>abc-1
<NAME>Grocer
<MEMO>Weekly shop
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260715120000
<TRNAMT>1500.00
<FITID>abc-2
<NAME>Employer
</STMTTRN>
</BANKTRANLIST>
</OFX>`;

const inspection = inspectTransactionOfxImport(ofx, "ofx");
assert.equal(inspection.fileType, "ofx");
assert.equal(inspection.statistics.recordCount, 2);
assert.equal(inspection.details.currencyCode, "AUD");
assert.equal(inspection.details.accountId, "123456");
assert.equal(inspection.details.statementStartDate, "2026-07-01");
assert.equal(inspection.details.statementEndDate, "2026-07-15");
assert.equal(inspection.diagnostics.length, 0);

const parsed = parseTransactionOfx(ofx);
assert.equal(parsed.length, 2);
assert.deepEqual(parsed[0], {
  rowNumber: 1, date: "2026-07-14", payee: "Grocer", memo: "Weekly shop",
  outflow: 42.5, inflow: 0,
  raw: { fitId: "abc-1", transactionType: "DEBIT", postedDate: "20260714120000", amount: "-42.50", name: "Grocer", memo: "Weekly shop" },
});
assert.equal(parsed[1].inflow, 1500);

const preview = previewTransactionOfxImport(ofx, []);
assert.equal(preview.summary.totalRows, 2);
assert.equal(preview.summary.newTransactions, 2);
assert.equal(preview.summary.selectedForImport, 2);
console.log("v3.16.1 unified import wizard OFX/QFX checks passed");
