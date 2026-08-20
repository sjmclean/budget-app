import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTransactionImportSourceIdentities,
  partitionPreviouslyImportedCandidates,
} from "../../../apps/web/src/features/accounts/transactionImportKnowledge.js";

function identicalFallbackCandidate(id: string) {
  return {
    id,
    parsed: {
      date: "2026-08-12",
      payee: "Coffee Shop",
      memo: "CARD PURCHASE",
      outflow: 20,
      inflow: 0,
      raw: {
        date: "2026-08-12",
        payee: "Coffee Shop",
        amount: "-20.00",
        memo: "CARD PURCHASE",
      },
    },
  };
}

function occurrenceCountsFor(
  fileType: "csv" | "qif" | "ofx" | "qfx",
  candidates: readonly ReturnType<typeof identicalFallbackCandidate>[],
): Record<string, number> {
  const identities = buildTransactionImportSourceIdentities(
    fileType,
    candidates,
  );

  return Object.fromEntries(
    candidates.map((candidate) => {
      const identity = identities[candidate.id]?.identity;
      assert.ok(identity);
      return [identity, 1];
    }),
  );
}

test("a legitimate identical transaction from a different source file is not silently suppressed", () => {
  const firstFileTransaction = identicalFallbackCandidate("file-a-row-2");

  const importedOccurrenceCounts = occurrenceCountsFor(
    "csv",
    [firstFileTransaction],
  );

  // This represents a different bank file containing another genuine
  // transaction whose fallback fields happen to be identical.
  const secondFileTransaction = identicalFallbackCandidate("file-b-row-2");

  const partition = partitionPreviouslyImportedCandidates({
    fileType: "csv",
    candidates: [secondFileTransaction],
    importedOccurrenceCounts,
  });

  assert.deepEqual(
    partition.activeCandidates.map((candidate) => candidate.id),
    ["file-b-row-2"],
    "a fallback identity from an earlier file must not silently suppress a distinct later transaction",
  );
  assert.equal(partition.previouslyImportedCandidates.length, 0);
});

test("a bank-provided external transaction ID still deduplicates across source files", () => {
  const firstFileTransaction = {
    ...identicalFallbackCandidate("file-a-row-2"),
    parsed: {
      ...identicalFallbackCandidate("file-a-row-2").parsed,
      raw: {
        date: "2026-08-12",
        payee: "Coffee Shop",
        amount: "-20.00",
        memo: "CARD PURCHASE",
        "Transaction ID": "bank-transaction-123",
      },
    },
  };

  const firstSourceIdentities = buildTransactionImportSourceIdentities(
    "csv",
    [firstFileTransaction],
  );
  const firstIdentity =
    firstSourceIdentities[firstFileTransaction.id]?.identity;
  assert.ok(firstIdentity);

  const secondFileTransaction = {
    ...identicalFallbackCandidate("file-b-row-2"),
    parsed: {
      ...identicalFallbackCandidate("file-b-row-2").parsed,
      raw: {
        date: "2026-08-12",
        payee: "Coffee Shop",
        amount: "-20.00",
        memo: "CARD PURCHASE",
        "Transaction ID": "bank-transaction-123",
      },
    },
  };

  const partition = partitionPreviouslyImportedCandidates({
    fileType: "csv",
    candidates: [secondFileTransaction],
    importedOccurrenceCounts: {
      [firstIdentity]: 1,
    },
  });

  assert.equal(partition.activeCandidates.length, 0);
  assert.deepEqual(
    partition.previouslyImportedCandidates.map((candidate) => candidate.id),
    ["file-b-row-2"],
    "a real external bank transaction ID remains safe to deduplicate across files",
  );
});

test("one proven previously imported row does not suppress a different heuristic exact match", () => {
  const previouslyImported = {
    ...identicalFallbackCandidate("old-row"),
    parsed: {
      ...identicalFallbackCandidate("old-row").parsed,
      raw: {
        date: "2026-08-10",
        payee: "Known Merchant",
        amount: "-10.00",
        "Transaction ID": "bank-proven-123",
      },
    },
  };

  const historicalSourceIdentities =
    buildTransactionImportSourceIdentities(
      "csv",
      [previouslyImported],
    );
  const historicalIdentity =
    historicalSourceIdentities[previouslyImported.id]?.identity;
  assert.ok(historicalIdentity);

  const repeatedKnownRow = {
    ...previouslyImported,
    id: "new-file-known-row",
  };

  const distinctHeuristicMatch = {
    ...identicalFallbackCandidate("new-file-legitimate-row"),
    status: "exact-match" as const,
  };

  const partition = partitionPreviouslyImportedCandidates({
    fileType: "csv",
    candidates: [repeatedKnownRow, distinctHeuristicMatch],
    importedOccurrenceCounts: {
      [historicalIdentity]: 1,
    },
  });

  assert.deepEqual(
    partition.previouslyImportedCandidates.map((candidate) => candidate.id),
    ["new-file-known-row"],
  );

  assert.deepEqual(
    partition.activeCandidates.map((candidate) => candidate.id),
    ["new-file-legitimate-row"],
    "a heuristic exact match must remain reviewable even when another row proves statement overlap",
  );

  assert.equal(partition.alreadyRepresentedCandidates.length, 0);
});
