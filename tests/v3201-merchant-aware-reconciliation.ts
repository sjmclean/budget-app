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
PWOOLWORTHS/GRIMSHAW ST GREENSBOROUGH
^
`;

const withoutKnowledge = previewTransactionQifImport(qif, [existing], {
  dateFormat: "DD/MM/YY",
  amountFormat: "decimal-dot",
});
assert.equal(withoutKnowledge.summary.newTransactions, 1);

const withKnowledge = previewTransactionQifImport(
  qif,
  [existing],
  {
    dateFormat: "DD/MM/YY",
    amountFormat: "decimal-dot",
  },
  rawPayee =>
    rawPayee.startsWith("WOOLWORTHS/") ? "Woolworths" : undefined,
);

assert.equal(withKnowledge.summary.exactMatches, 1);
assert.equal(
  withKnowledge.candidates[0].matchedTransactionId,
  existing.id,
  "Merchant Knowledge should resolve the bank payee before register matching",
);
assert.equal(
  withKnowledge.candidates[0].parsed.payee,
  "WOOLWORTHS/GRIMSHAW ST GREENSBOROUGH",
  "Matching must not mutate the immutable bank payee",
);

console.log("v3.20.1 merchant-aware reconciliation checks passed");
