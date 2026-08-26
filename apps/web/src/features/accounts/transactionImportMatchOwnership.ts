import type { TransactionImportCandidate } from "./transactionImport";

export interface TransactionImportProcessedMatch {
  candidate: TransactionImportCandidate;
  action: "imported" | "matched" | "skipped";
}

export function getTransactionImportMatchedTransactionId(
  candidate: TransactionImportCandidate,
): string | null {
  if (candidate.status !== "exact-match") {
    return null;
  }

  return (
    candidate.matchedTransaction?.id ??
    candidate.matchedTransactionId ??
    null
  );
}

export function findTransactionImportMatchOwner(
  transactionId: string,
  candidateId: string,
  pendingCandidates: readonly TransactionImportCandidate[],
  processedCandidates: readonly TransactionImportProcessedMatch[],
): TransactionImportCandidate | null {
  for (const candidate of pendingCandidates) {
    if (candidate.id === candidateId) {
      continue;
    }

    if (
      getTransactionImportMatchedTransactionId(candidate) === transactionId
    ) {
      return candidate;
    }
  }

  for (const entry of processedCandidates) {
    if (
      entry.action !== "matched" ||
      entry.candidate.id === candidateId
    ) {
      continue;
    }

    if (
      getTransactionImportMatchedTransactionId(entry.candidate) ===
      transactionId
    ) {
      return entry.candidate;
    }
  }

  return null;
}

export function isTransactionImportMatchAvailable(
  transactionId: string,
  candidateId: string,
  pendingCandidates: readonly TransactionImportCandidate[],
  processedCandidates: readonly TransactionImportProcessedMatch[],
): boolean {
  return (
    findTransactionImportMatchOwner(
      transactionId,
      candidateId,
      pendingCandidates,
      processedCandidates,
    ) === null
  );
}

export function getAvailableTransactionImportMatches(
  candidate: TransactionImportCandidate,
  pendingCandidates: readonly TransactionImportCandidate[],
  processedCandidates: readonly TransactionImportProcessedMatch[],
) {
  return (candidate.matchCandidates ?? []).filter((option) =>
    isTransactionImportMatchAvailable(
      option.transaction.id,
      candidate.id,
      pendingCandidates,
      processedCandidates,
    ),
  );
}

function releaseTransactionImportMatch(
  candidate: TransactionImportCandidate,
): TransactionImportCandidate {
  return {
    ...candidate,
    status: "new",
    matchedTransactionId: undefined,
    matchedTransaction: undefined,
    selected: false,
    reviewDecision: undefined,
    reason:
      "The previously selected register match is already linked to another imported transaction. Choose another possible match or import this transaction as new.",
  };
}

export function repairTransactionImportReviewOwnership<
  T extends TransactionImportProcessedMatch,
>(
  pendingCandidates: readonly TransactionImportCandidate[],
  processedCandidates: readonly T[],
): {
  pendingCandidates: TransactionImportCandidate[];
  processedCandidates: T[];
  releasedCandidateIds: string[];
} {
  const claimedTransactionIds = new Set<string>();
  const repairedProcessed: T[] = [];
  const releasedCandidates: TransactionImportCandidate[] = [];
  const releasedCandidateIds: string[] = [];

  // Accepted review decisions own their register matches first.
  for (const entry of processedCandidates) {
    if (entry.action !== "matched") {
      repairedProcessed.push(entry);
      continue;
    }

    const transactionId =
      getTransactionImportMatchedTransactionId(entry.candidate);

    if (!transactionId || !claimedTransactionIds.has(transactionId)) {
      if (transactionId) {
        claimedTransactionIds.add(transactionId);
      }
      repairedProcessed.push(entry);
      continue;
    }

    releasedCandidates.push(releaseTransactionImportMatch(entry.candidate));
    releasedCandidateIds.push(entry.candidate.id);
  }

  const repairedPending: TransactionImportCandidate[] = [];

  for (const candidate of pendingCandidates) {
    const transactionId =
      getTransactionImportMatchedTransactionId(candidate);

    if (!transactionId) {
      repairedPending.push(candidate);
      continue;
    }

    if (claimedTransactionIds.has(transactionId)) {
      repairedPending.push(releaseTransactionImportMatch(candidate));
      releasedCandidateIds.push(candidate.id);
      continue;
    }

    claimedTransactionIds.add(transactionId);
    repairedPending.push(candidate);
  }

  return {
    pendingCandidates: [
      ...repairedPending,
      ...releasedCandidates,
    ],
    processedCandidates: repairedProcessed,
    releasedCandidateIds,
  };
}
