import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes.js";
import {
  assessTransactionImportMatch,
  previewTransactionQifImport,
  type ParsedImportTransaction,
} from "../apps/web/src/features/accounts/transactionImport.js";

function createTransaction(input: {
  id: string;
  date: string;
  payee: string;
  outflow?: number;
  inflow?: number;
}): RegisterTransactionView {
  return {
    id: input.id,
    date: input.date,
    payee: input.payee,
    category: "Uncategorised",
    memo: "",
    checkNumber: "",
    outflow: input.outflow ?? 0,
    inflow: input.inflow ?? 0,
    cleared: false,
    reconciled: false,
    flag: null,
    attachmentCount: 0,
    runningBalance: 0,
  };
}

function createImported(input: {
  date: string;
  payee: string;
  outflow?: number;
  inflow?: number;
}): ParsedImportTransaction {
  return {
    rowNumber: 2,
    date: input.date,
    payee: input.payee,
    memo: "",
    outflow: input.outflow ?? 0,
    inflow: input.inflow ?? 0,
    raw: {},
  };
}

const candidates = [
  createTransaction({ id: "bakers", date: "2026-06-26", payee: "Bakers Delight", outflow: 6 }),
  createTransaction({ id: "afl-close", date: "2026-06-28", payee: "AFL Record", outflow: 6 }),
  createTransaction({ id: "wrong-amount", date: "2026-06-30", payee: "AFL Record Southbank", outflow: 12 }),
];

const assessment = assessTransactionImportMatch(
  createImported({ date: "2026-06-30", payee: "AFL RECORD SOUTHBANK", outflow: 6 }),
  candidates,
);

assert.equal(assessment.candidates.length, 2, "only same-amount candidates should be ranked");
assert.equal(assessment.candidates[0].transaction.id, "afl-close");
assert.ok(
  assessment.candidates[0].confidence > assessment.candidates[1].confidence,
  "ranked candidates should be ordered by confidence",
);

const qifPreview = previewTransactionQifImport(
  `D30/06/2026\nT-6.00\nPAFL RECORD SOUTHBANK\n^`,
  [createTransaction({ id: "bakers", date: "2026-06-26", payee: "Bakers Delight", outflow: 6 })],
);

assert.equal(qifPreview.candidates[0].status, "new");
assert.equal(qifPreview.candidates[0].matchCandidates?.[0]?.transaction.id, "bakers");
assert.ok(
  qifPreview.candidates[0].evidence?.some(
    (item) => item.label === "Payee" && item.result === "negative",
  ),
  "review candidates should carry evidence for the UI",
);

const dialogSource = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
assert.match(dialogSource, /Closest candidate/);
assert.match(dialogSource, /Import match evidence/);

console.log("v2.61.8 transaction intake ranked candidate checks passed");
