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

test("exact amount within the date window remains available for manual review despite unrelated payee text", () => {
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
  assert.deepEqual(
    assessment.candidates.map(({ transaction }) => transaction.id),
    ["existing"],
  );
  assert.equal(assessment.candidates[0]?.automaticMatch, false);
});

test("resolved merchant identity ranks above a closer unrelated review candidate", () => {
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

test("equally plausible manual transactions require review instead of an arbitrary automatic match", () => {
  const assessment = assessTransactionImportMatch(
    buildParsedImportTransaction({
      date: "2026-08-14",
      payee: "Example Membership Association",
      outflow: 37.5,
    }),
    [
      buildRegisterTransaction({
        id: "manual-a",
        date: "2026-08-14",
        payee: "Example Membership Association",
        outflow: 37.5,
      }),
      buildRegisterTransaction({
        id: "manual-b",
        date: "2026-08-14",
        payee: "Example Membership Association",
        outflow: 37.5,
      }),
    ],
  );

  assert.equal(
    assessment.kind,
    "new",
    "two equally plausible existing transactions must not be resolved by an arbitrary ID tie-break",
  );
  assert.equal(assessment.status, "new");
  assert.equal(assessment.recommendation, "import");
  assert.equal(
    assessment.selectedCandidate,
    undefined,
    "ambiguous automatic matches must remain for explicit user review",
  );

  assert.deepEqual(
    assessment.candidates.map((candidate) => candidate.transaction.id),
    ["manual-a", "manual-b"],
    "both plausible candidates must remain visible to the reviewer",
  );

  assert.ok(
    assessment.candidates.every((candidate) => candidate.merchantMatches),
  );
});
