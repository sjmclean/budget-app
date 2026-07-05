import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { RegisterTransactionView } from "../apps/web/src/features/accounts/accountRegisterTypes.js";
import { normaliseMerchant } from "../apps/web/src/features/accounts/merchantNormalisation.js";
import {
  assessTransactionImportMatch,
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

assert.deepEqual(normaliseMerchant("  WOOLWORTHS    1234 AU  "), {
  raw: "WOOLWORTHS    1234 AU",
  canonical: "woolworths",
  tokens: ["woolworths"],
});
assert.equal(normaliseMerchant("WOOLWORTHS AU").canonical, "woolworths");
assert.equal(normaliseMerchant("VISA DEBIT WOOLWORTHS 5478").canonical, "woolworths");
assert.equal(
  normaliseMerchant("AFL RECORD SOUTHBANK").canonical,
  "afl record southbank",
);

const woolworthsAssessment = assessTransactionImportMatch(
  createImported({ date: "2026-06-30", payee: "WOOLWORTHS 1234 AU", outflow: 42.5 }),
  [createTransaction({ id: "woolies", date: "2026-06-29", payee: "Woolworths", outflow: 42.5 })],
);

assert.equal(woolworthsAssessment.status, "exact-match");
assert.equal(woolworthsAssessment.selectedCandidate?.payeeSimilarity, 100);
assert.ok(
  woolworthsAssessment.evidence?.some(
    (item) => item.label === "Payee" && item.result === "positive",
  ),
  "normalised merchants should produce positive payee evidence",
);

const unrelatedAssessment = assessTransactionImportMatch(
  createImported({ date: "2026-06-30", payee: "AFL RECORD SOUTHBANK", outflow: 6 }),
  [createTransaction({ id: "bakers", date: "2026-06-26", payee: "Bakers Delight", outflow: 6 })],
);

assert.equal(unrelatedAssessment.status, "new");
assert.ok(
  (unrelatedAssessment.selectedCandidate?.payeeSimilarity ?? 100) < 60,
  "merchant normalisation must not make unrelated same-amount merchants look related",
);

const importSource = readFileSync(
  "apps/web/src/features/accounts/transactionImport.ts",
  "utf8",
);
assert.match(importSource, /normaliseMerchant/);
assert.doesNotMatch(importSource, /normalisePayeeTokens\(left\)/);

console.log("v2.61.9 transaction intake merchant normalisation checks passed");
