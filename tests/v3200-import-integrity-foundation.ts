import assert from "node:assert/strict";

import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes";
import { previewTransactionQifImport } from "../apps/web/src/features/accounts/transactionImport";

const existing: RegisterTransactionView = {
  id: "existing-woolworths",
  date: "2026-07-15",
  payee: "Woolworths",
  category: "Groceries",
  memo: "",
  checkNumber: "",
  outflow: 30.95,
  inflow: 0,
  cleared: false,
  reconciled: false,
  flag: null,
  attachmentCount: 0,
  runningBalance: 0,
};

const qif = `!Type:Bank
D15/07/26
T-30.95
PWoolworths
^
D15/07/26
T-30.95
PWoolworths
^
`;

const preview = previewTransactionQifImport(qif, [existing], {
  dateFormat: "DD/MM/YY",
  amountFormat: "decimal-dot",
});

assert.equal(preview.summary.totalRows, 2);
assert.equal(preview.summary.exactMatches, 1);
assert.equal(preview.summary.newTransactions, 1);
assert.equal(
  preview.candidates.filter((candidate) => candidate.matchedTransactionId === existing.id).length,
  1,
  "A register transaction must only be allocated to one imported row per preview",
);

console.log("v3.20.0 import integrity foundation checks passed");
