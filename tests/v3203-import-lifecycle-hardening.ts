import assert from "node:assert/strict";

import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes";
import { previewTransactionQifImport } from "../apps/web/src/features/accounts/transactionImport";

const existing: RegisterTransactionView = {
  id: "netflix-existing",
  date: "2026-07-15",
  payee: "Netflix",
  category: "Streaming",
  memo: "",
  checkNumber: "",
  outflow: 22.99,
  inflow: 0,
  cleared: false,
  reconciled: false,
  flag: null,
  attachmentCount: 0,
  runningBalance: 0,
};

const qif = `!Type:Bank\nD15/07/26\nT-22.99\nPNETFLIX XYZ\n^\n`;

const partialResolution = previewTransactionQifImport(
  qif,
  [existing],
  { dateFormat: "DD/MM/YY", amountFormat: "decimal-dot" },
  () => ({ suggestedCategoryName: "Streaming" }),
);

assert.equal(partialResolution.candidates.length, 1);
assert.equal(
  partialResolution.candidates[0].lifecycle.merchant.canonicalPayee,
  "NETFLIX XYZ",
  "A partial Merchant Knowledge result must fall back to the immutable bank payee",
);
assert.equal(
  partialResolution.candidates[0].lifecycle.merchant.suggestedCategoryName,
  "Streaming",
);
assert.equal(
  partialResolution.candidates[0].lifecycle.merchant.transferAccountName,
  null,
);

const stringResolution = previewTransactionQifImport(
  qif,
  [existing],
  { dateFormat: "DD/MM/YY", amountFormat: "decimal-dot" },
  () => "Netflix",
);
assert.equal(stringResolution.summary.exactMatches, 1);
assert.equal(
  stringResolution.candidates[0].lifecycle.merchant.canonicalPayee,
  "Netflix",
);

const emptyResolution = previewTransactionQifImport(
  qif,
  [],
  { dateFormat: "DD/MM/YY", amountFormat: "decimal-dot" },
  () => ({}),
);
assert.equal(
  emptyResolution.candidates[0].lifecycle.merchant.canonicalPayee,
  "NETFLIX XYZ",
);
assert.equal(
  emptyResolution.candidates[0].lifecycle.merchant.suggestedCategoryName,
  null,
);

console.log("v3.20.3 import lifecycle hardening checks passed");
