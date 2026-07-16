import assert from "node:assert/strict";
import {
  analyseTransactionCsvImport,
  inspectTransactionCsvImport,
  inspectTransactionQifImport,
} from "../apps/web/src/features/accounts/transactionImport.js";

const qif = `!Type:Bank\nD03/04/26\nT-12.34\nPExample\nL[Savings]\nC*\n^`;
const qifInspection = inspectTransactionQifImport(qif, {
  preferredDateFormat: "DD/MM/YYYY",
});
assert.equal(qifInspection.fileType, "qif");
assert.equal(qifInspection.settings.dateFormat.value, "DD/MM/YY");
assert.equal(qifInspection.settings.dateFormat.source, "application");
assert.equal(qifInspection.settings.dateFormat.needsConfirmation, true);
assert.equal(qifInspection.details.accountType, "Bank");
assert.equal(qifInspection.details.transferRecordCount, 1);
assert.equal(qifInspection.details.clearedRecordCount, 1);
assert.equal(qifInspection.statistics.recordCount, 1);

const csv = `Date,Description,Debit,Credit\n16/07/2026,Grocer,42.10,\n17/07/2026,Salary,,500.00`;
const csvInspection = inspectTransactionCsvImport(csv);
assert.equal(csvInspection.fileType, "csv");
assert.equal(csvInspection.statistics.recordCount, 2);
assert.equal(csvInspection.settings.delimiter.value, ",");
assert.equal(csvInspection.settings.mapping.value[0], "date");
assert.equal(csvInspection.settings.mapping.value[1], "payee");
assert.equal(csvInspection.settings.mapping.value[2], "outflow");
assert.equal(csvInspection.settings.mapping.value[3], "inflow");
assert.deepEqual(
  analyseTransactionCsvImport(csv),
  csvInspection.details.analysis,
  "The legacy CSV analysis API should remain a compatibility wrapper over the shared inspector.",
);

console.log("v3.15.7 import inspection foundation checks passed");
