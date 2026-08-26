import assert from "node:assert/strict";
import test from "node:test";

import {
  assignTransactionImportMatches,
  type TransactionImportCandidate,
} from "../../../apps/web/src/features/accounts/transactionImport.js";
import type { TransactionImportMatchCandidateAssessment } from "../../../apps/web/src/features/accounts/transactionImportReconciliation.js";
import { buildRegisterTransaction } from "../../support/builders/importMatchingBuilders.js";

function assessment(
  transactionId: string,
  matchScore: number,
): TransactionImportMatchCandidateAssessment {
  return {
    transaction: buildRegisterTransaction({
      id: transactionId,
    }),
    evidence: [],
    daysApart: 0,
    payeeSimilarity: 100,
    merchantMatches: true,
    amountCompetitionCount: 3,
    matchScore,
    automaticMatch: true,
    reason: `${transactionId} scored ${matchScore}`,
  };
}

function candidate(
  id: string,
  options: readonly TransactionImportMatchCandidateAssessment[],
): TransactionImportCandidate {
  return {
    id,
    parsed: {
      rowNumber: 1,
      date: "2026-08-17",
      payee: id,
      outflow: 100,
      inflow: 0,
      raw: {},
    },
    status: "new",
    reason: "test candidate",
    matchCandidates: [...options],
    selected: true,
    errors: [],
    lifecycle: {
      source: {
        rowNumber: 1,
        date: "2026-08-17",
        rawPayee: id,
        outflow: 100,
        inflow: 0,
      },
      merchant: {
        canonicalPayee: id,
        suggestedCategoryName: null,
        transferAccountName: null,
      },
      proposal: {
        payee: id,
        categoryName: null,
        transferAccountName: null,
      },
    },
  };
}

function assignments(
  result: readonly TransactionImportCandidate[],
): Record<string, string | undefined> {
  return Object.fromEntries(
    result.map((entry) => [
      entry.id,
      entry.matchedTransactionId,
    ]),
  );
}

function totalAssignedScore(
  result: readonly TransactionImportCandidate[],
): number {
  return result.reduce((total, entry) => {
    if (!entry.matchedTransactionId) {
      return total;
    }

    const matched = entry.matchCandidates?.find(
      (option) =>
        option.transaction.id === entry.matchedTransactionId,
    );

    return total + (matched?.matchScore ?? 0);
  }, 0);
}

function buildConflictCandidates() {
  return [
    candidate("import-a", [
      assessment("register-x", 100),
      assessment("register-y", 80),
    ]),
    candidate("import-b", [
      assessment("register-x", 90),
      assessment("register-z", 80),
    ]),
  ];
}

test("global assignment maximises total confidence after preserving match cardinality", () => {
  const result = assignTransactionImportMatches(
    buildConflictCandidates(),
  );

  assert.deepEqual(
    assignments(result),
    {
      "import-a": "register-x",
      "import-b": "register-z",
    },
    "the stronger claim on register X must remain with import A",
  );

  assert.equal(
    totalAssignedScore(result),
    180,
    "among two-match assignments, the matcher must choose the highest total confidence",
  );
});

test("global assignment is invariant to imported-row ordering", () => {
  const forward = assignTransactionImportMatches(
    buildConflictCandidates(),
  );

  const reverse = assignTransactionImportMatches(
    [...buildConflictCandidates()].reverse(),
  );

  assert.deepEqual(
    assignments(forward),
    assignments(reverse),
    "reordering imported rows must not change which register transaction each row receives",
  );

  assert.equal(totalAssignedScore(forward), 180);
  assert.equal(totalAssignedScore(reverse), 180);
});

test("global assignment preserves maximum cardinality before maximising confidence", () => {
  /*
   * A strongly prefers X, but B can only use X.
   *
   * A -> X = 100
   * A -> Y =  80
   * B -> X =  90
   *
   * Taking only A -> X has the strongest single edge but produces one match.
   * The required global result is:
   *
   * A -> Y = 80
   * B -> X = 90
   * total = 170, cardinality = 2
   */
  const result = assignTransactionImportMatches([
    candidate("import-a", [
      assessment("register-x", 100),
      assessment("register-y", 80),
    ]),
    candidate("import-b", [
      assessment("register-x", 90),
    ]),
  ]);

  assert.deepEqual(
    assignments(result),
    {
      "import-a": "register-y",
      "import-b": "register-x",
    },
    "a higher-confidence single edge must not reduce the number of valid automatic matches",
  );

  assert.equal(
    result.filter(
      (entry) => entry.status === "exact-match",
    ).length,
    2,
  );

  assert.equal(totalAssignedScore(result), 170);
});

test("equal-confidence global assignments resolve deterministically across permutations", () => {
  /*
   * Two maximum-cardinality assignments have the same total score:
   *
   * A -> X 90 + B -> Y 80 = 170
   * A -> Y 80 + B -> X 90 = 170
   *
   * There is no confidence reason to prefer one. The important invariant is
   * that stable candidate/transaction IDs choose the same answer regardless
   * of source-row ordering.
   */
  function equalScoreCandidates() {
    return [
      candidate("import-a", [
        assessment("register-x", 90),
        assessment("register-y", 80),
      ]),
      candidate("import-b", [
        assessment("register-x", 90),
        assessment("register-y", 80),
      ]),
    ];
  }

  const forward = assignTransactionImportMatches(
    equalScoreCandidates(),
  );

  const reversed = assignTransactionImportMatches(
    [...equalScoreCandidates()].reverse(),
  );

  assert.equal(
    forward.filter(
      (entry) => entry.status === "exact-match",
    ).length,
    2,
  );

  assert.equal(
    reversed.filter(
      (entry) => entry.status === "exact-match",
    ).length,
    2,
  );

  assert.equal(totalAssignedScore(forward), 170);
  assert.equal(totalAssignedScore(reversed), 170);

  assert.deepEqual(
    assignments(forward),
    assignments(reversed),
    "equal-score global assignments must use a deterministic ID-based tie break rather than import order",
  );
});

test("independent assignment components preserve their own optimal solutions", () => {
  /*
   * Component one:
   *
   * A -> X = 100
   * A -> Y =  80
   * B -> X =  90
   * B -> Z =  80
   *
   * optimum = A -> X, B -> Z = 180
   *
   * Component two is entirely disconnected:
   *
   * C -> P = 95
   * D -> Q = 90
   *
   * Adding or reordering that component must not alter component one's
   * assignment.
   */
  function candidatesWithIndependentComponent() {
    return [
      candidate("import-a", [
        assessment("register-x", 100),
        assessment("register-y", 80),
      ]),
      candidate("import-b", [
        assessment("register-x", 90),
        assessment("register-z", 80),
      ]),
      candidate("import-c", [
        assessment("register-p", 95),
      ]),
      candidate("import-d", [
        assessment("register-q", 90),
      ]),
    ];
  }

  const forward = assignTransactionImportMatches(
    candidatesWithIndependentComponent(),
  );

  const reordered = assignTransactionImportMatches([
    ...candidatesWithIndependentComponent().slice(2),
    ...candidatesWithIndependentComponent().slice(0, 2),
  ]);

  const expected = {
    "import-a": "register-x",
    "import-b": "register-z",
    "import-c": "register-p",
    "import-d": "register-q",
  };

  assert.deepEqual(assignments(forward), expected);
  assert.deepEqual(assignments(reordered), expected);

  assert.equal(totalAssignedScore(forward), 365);
  assert.equal(totalAssignedScore(reordered), 365);
});

test("large independent assignment sets retain every deterministic match", () => {
  const size = 1000;

  const input = Array.from(
    { length: size },
    (_, index) =>
      candidate(
        `import-${String(index).padStart(4, "0")}`,
        [
          assessment(
            `register-${String(index).padStart(4, "0")}`,
            100,
          ),
        ],
      ),
  );

  const result = assignTransactionImportMatches(input);

  assert.equal(
    result.filter(
      (entry) => entry.status === "exact-match",
    ).length,
    size,
  );

  for (let index = 0; index < size; index += 1) {
    const suffix = String(index).padStart(4, "0");

    assert.equal(
      result[index]?.matchedTransactionId,
      `register-${suffix}`,
    );
  }

  assert.equal(totalAssignedScore(result), size * 100);
});

test("a rejected ambiguous assignment does not consume the register row needed by a safe candidate", () => {
  /*
   * A has the strongest automatic claim on X, but A is locally ambiguous
   * because Y is a credible merchant-matching competitor within the winner
   * margin. Y is deliberately review-only, so it does not participate in
   * the automatic assignment graph.
   *
   * B has one safe automatic option: X.
   *
   * The first maximum-cardinality flow can therefore choose A -> X. If A's
   * assignment is subsequently rejected as ambiguous, X must be reconsidered
   * for B rather than remaining consumed by the discarded assignment.
   */
  const ambiguousReviewOnlyCompetitor = {
    ...assessment("register-y", 95),
    automaticMatch: false,
  };

  const result = assignTransactionImportMatches([
    candidate("import-a", [
      assessment("register-x", 100),
      ambiguousReviewOnlyCompetitor,
    ]),
    candidate("import-b", [
      assessment("register-x", 90),
    ]),
  ]);

  assert.deepEqual(
    assignments(result),
    {
      "import-a": undefined,
      "import-b": "register-x",
    },
    "rejecting A's ambiguous assignment must release X for the safe nonambiguous candidate B",
  );

  assert.equal(
    result.find((entry) => entry.id === "import-a")?.status,
    "new",
    "the locally ambiguous candidate must remain available for explicit review",
  );

  assert.equal(
    result.find((entry) => entry.id === "import-b")?.status,
    "exact-match",
    "the safe candidate must retain its automatic match after the ambiguous assignment is rejected",
  );
});
