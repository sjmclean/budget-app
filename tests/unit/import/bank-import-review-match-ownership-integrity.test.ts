import assert from "node:assert/strict";
import test from "node:test";

import {
  findTransactionImportMatchOwner,
  getAvailableTransactionImportMatches,
  isTransactionImportMatchAvailable,
  repairTransactionImportReviewOwnership,
} from "../../../apps/web/src/features/accounts/transactionImportMatchOwnership";
import type {
  TransactionImportCandidate,
  TransactionImportMatchCandidateAssessment,
} from "../../../apps/web/src/features/accounts/transactionImport";

function candidate(
  id: string,
  transactionId?: string,
): TransactionImportCandidate {
  return {
    id,
    parsed: {
      rowNumber: Number(id.replace(/\D/g, "")) || 1,
      date: "2026-08-26",
      payee: id,
      memo: "",
      outflow: 10,
      inflow: 0,
    },
    status: transactionId ? "exact-match" : "new",
    matchedTransactionId: transactionId,
    matchedTransaction: transactionId
      ? {
          id: transactionId,
          accountId: "account-1",
          date: "2026-08-26",
          payee: "Register transaction",
          category: "",
          memo: "",
          outflow: 10,
          inflow: 0,
          cleared: false,
          reconciled: false,
        }
      : undefined,
    reason: "",
    evidence: [],
    matchCandidates: [],
    selected: false,
    errors: [],
    lifecycle: {
      source: {
        rawPayee: id,
      },
      merchant: {
        canonicalPayee: id,
      },
      proposal: {
        payee: id,
        categoryName: null,
        transferAccountName: null,
      },
    },
    trace: [],
  } as TransactionImportCandidate;
}

function matchOption(
  transactionId: string,
): TransactionImportMatchCandidateAssessment {
  return {
    transaction: {
      id: transactionId,
      accountId: "account-1",
      date: "2026-08-26",
      payee: transactionId,
      category: "",
      memo: "",
      outflow: 10,
      inflow: 0,
      cleared: false,
      reconciled: false,
    },
    evidence: [],
    reason: "",
    score: 100,
    merchantMatches: true,
    automaticMatch: true,
  } as TransactionImportMatchCandidateAssessment;
}

test("accepted match reserves its register transaction from later candidates", () => {
  const candidateA = candidate("row-1", "register-x");
  const candidateB = candidate("row-2");

  const processed = [
    {
      candidate: candidateA,
      action: "matched" as const,
    },
  ];

  assert.equal(
    isTransactionImportMatchAvailable(
      "register-x",
      candidateB.id,
      [candidateB],
      processed,
    ),
    false,
  );

  assert.equal(
    findTransactionImportMatchOwner(
      "register-x",
      candidateB.id,
      [candidateB],
      processed,
    )?.id,
    candidateA.id,
  );
});

test("taken possible matches are removed rather than disabled", () => {
  const candidateA = candidate("row-1", "register-x");
  const candidateB = {
    ...candidate("row-2"),
    matchCandidates: [
      matchOption("register-x"),
      matchOption("register-z"),
    ],
  };

  assert.deepEqual(
    getAvailableTransactionImportMatches(
      candidateB,
      [candidateB],
      [{ candidate: candidateA, action: "matched" }],
    ).map((option) => option.transaction.id),
    ["register-z"],
  );
});

test("pending candidate also reserves its selected register transaction", () => {
  const candidateA = candidate("row-1", "register-x");
  const candidateB = candidate("row-2");

  assert.equal(
    isTransactionImportMatchAvailable(
      "register-x",
      candidateB.id,
      [candidateA, candidateB],
      [],
    ),
    false,
  );
});

test("candidate does not conflict with its own selected match", () => {
  const candidateA = candidate("row-1", "register-x");

  assert.equal(
    isTransactionImportMatchAvailable(
      "register-x",
      candidateA.id,
      [candidateA],
      [],
    ),
    true,
  );
});

test("converting a matched candidate to import as new releases its register transaction", () => {
  const matched = candidate("row-1", "register-x");
  const converted = {
    ...matched,
    status: "new" as const,
    matchedTransactionId: undefined,
    matchedTransaction: undefined,
    selected: true,
    reviewDecision: "import-as-new" as const,
  };
  const other = candidate("row-2");

  assert.equal(
    isTransactionImportMatchAvailable(
      "register-x",
      other.id,
      [converted, other],
      [],
    ),
    true,
  );
});

test("stale match fields on a non-matched candidate do not reserve the register transaction", () => {
  const converted = {
    ...candidate("row-1", "register-x"),
    status: "new" as const,
    selected: true,
    reviewDecision: "import-as-new" as const,
  };
  const other = candidate("row-2");

  assert.equal(
    isTransactionImportMatchAvailable(
      "register-x",
      other.id,
      [converted, other],
      [],
    ),
    true,
  );
});

test("undoing an accepted match releases its register transaction", () => {
  const candidateA = candidate("row-1");
  const candidateB = candidate("row-2");

  assert.equal(
    isTransactionImportMatchAvailable(
      "register-x",
      candidateB.id,
      [candidateA, candidateB],
      [],
    ),
    true,
  );
});

test("restore returns duplicate processed match to review", () => {
  const candidateA = candidate("row-1", "register-x");
  const candidateB = candidate("row-2", "register-x");

  const result = repairTransactionImportReviewOwnership(
    [],
    [
      {
        candidate: candidateA,
        action: "matched" as const,
        processedAt: 1,
      },
      {
        candidate: candidateB,
        action: "matched" as const,
        processedAt: 2,
      },
    ],
  );

  assert.deepEqual(result.releasedCandidateIds, ["row-2"]);
  assert.equal(result.processedCandidates.length, 1);
  assert.equal(result.processedCandidates[0]?.candidate.id, "row-1");

  const released = result.pendingCandidates[0];
  assert.equal(released?.id, "row-2");
  assert.equal(released?.status, "new");
  assert.equal(released?.matchedTransactionId, undefined);
  assert.equal(released?.matchedTransaction, undefined);
});

test("restore releases pending match already owned by processed candidate", () => {
  const candidateA = candidate("row-1", "register-x");
  const candidateB = candidate("row-2", "register-x");

  const result = repairTransactionImportReviewOwnership(
    [candidateB],
    [
      {
        candidate: candidateA,
        action: "matched" as const,
        processedAt: 1,
      },
    ],
  );

  assert.deepEqual(result.releasedCandidateIds, ["row-2"]);
  assert.equal(result.processedCandidates[0]?.candidate.id, "row-1");
  assert.equal(result.pendingCandidates[0]?.matchedTransactionId, undefined);
});

test("restore releases later duplicate pending ownership", () => {
  const candidateA = candidate("row-1", "register-x");
  const candidateB = candidate("row-2", "register-x");

  const result = repairTransactionImportReviewOwnership(
    [candidateA, candidateB],
    [],
  );

  assert.deepEqual(result.releasedCandidateIds, ["row-2"]);
  assert.equal(
    result.pendingCandidates[0]?.matchedTransactionId,
    "register-x",
  );
  assert.equal(
    result.pendingCandidates[1]?.matchedTransactionId,
    undefined,
  );
});
