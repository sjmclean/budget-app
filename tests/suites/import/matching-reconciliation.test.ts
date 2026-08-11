import assert from "node:assert/strict";
import test from "node:test";

import {
  TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS,
  assessTransactionImportMatch,
} from "../../../apps/web/src/features/accounts/transactionImportReconciliation";
import {
  buildParsedImportTransaction,
  buildRegisterTransaction,
} from "../../support/builders/importMatchingBuilders";

test("amount and date without merchant identity remain an explicit-review candidate", () => {
  const assessment = assessTransactionImportMatch(
    buildParsedImportTransaction({
      date: "2026-06-30",
      payee: "AFL RECORD SOUTHBANK",
      outflow: 6,
    }),
    [
      buildRegisterTransaction({
        id: "existing",
        date: "2026-06-26",
        payee: "Bakers Delight",
        outflow: 6,
      }),
    ],
  );

  assert.equal(assessment.kind, "new");
  assert.equal(assessment.status, "new");
  assert.equal(assessment.recommendation, "import");
  assert.equal(assessment.selectedCandidate, undefined);
  assert.equal(assessment.candidates[0]?.transaction.id, "existing");
  assert.equal(assessment.candidates[0]?.merchantMatches, false);
  assert.deepEqual(
    assessment.candidates[0]?.evidence.map(({ label, result }) => ({ label, result })),
    [
      { label: "Amount", result: "positive" },
      { label: "Date", result: "neutral" },
      { label: "Merchant", result: "negative" },
    ],
  );
  assert.equal("confidence" in assessment, false);
});

test("resolved merchant identity ranks before a closer unrelated candidate", () => {
  const assessment = assessTransactionImportMatch(
    buildParsedImportTransaction({
      date: "2026-06-30",
      payee: "WOOLWORTHS 1234 AU",
      outflow: 42.5,
    }),
    [
      buildRegisterTransaction({
        id: "closer-unrelated",
        date: "2026-06-30",
        payee: "Local Pharmacy",
        outflow: 42.5,
      }),
      buildRegisterTransaction({
        id: "resolved-merchant",
        date: "2026-06-28",
        payee: "Woolworths",
        outflow: 42.5,
      }),
    ],
  );

  assert.deepEqual(
    assessment.candidates.map(({ transaction }) => transaction.id),
    ["resolved-merchant", "closer-unrelated"],
  );
  assert.equal(assessment.selectedCandidate?.merchantMatches, true);
  assert.equal(assessment.selectedCandidate?.payeeSimilarity, 100);
});

test("candidate eligibility rejects amount mismatches and dates outside the window", () => {
  const assessment = assessTransactionImportMatch(
    buildParsedImportTransaction(),
    [
      buildRegisterTransaction({ id: "wrong-amount", outflow: 11 }),
      buildRegisterTransaction({
        id: "too-old",
        date: "2026-06-22",
      }),
    ],
  );

  assert.equal(TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS, 7);
  assert.equal(assessment.kind, "new");
  assert.equal(assessment.status, "new");
  assert.equal(assessment.recommendation, "import");
  assert.deepEqual(assessment.candidates, []);
});

test("an excluded register row cannot be consumed twice", () => {
  const assessment = assessTransactionImportMatch(
    buildParsedImportTransaction(),
    [buildRegisterTransaction({ id: "already-consumed" })],
    new Set(["already-consumed"]),
  );

  assert.equal(assessment.status, "new");
  assert.equal(assessment.selectedCandidate, undefined);
});
