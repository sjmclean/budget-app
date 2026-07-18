import assert from "node:assert/strict";

import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes";
import {
  assessTransactionImportMatch,
  type ParsedImportTransaction,
} from "../apps/web/src/features/accounts/transactionImport";

const existing: RegisterTransactionView = {
  id: "existing-netflix",
  date: "2026-07-15",
  payee: "Netflix",
  category: "Netflix",
  memo: "",
  checkNumber: "",
  outflow: 25.99,
  inflow: 0,
  cleared: false,
  reconciled: false,
  flag: null,
  attachmentCount: 0,
  runningBalance: 0,
};

const imported: ParsedImportTransaction = {
  rowNumber: 2,
  date: "2026-07-15",
  payee: "Netflix",
  memo: "",
  outflow: 25.99,
  inflow: 0,
  raw: {},
};

const assessment = assessTransactionImportMatch(imported, [existing]);
assert.equal(assessment.status, "exact-match");
assert.equal(assessment.selectedCandidate?.transaction.id, existing.id);

console.log("Exact current-register transaction match checks passed");
