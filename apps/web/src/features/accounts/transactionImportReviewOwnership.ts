import type { TransactionImportCandidate } from "./transactionImport";

interface ProcessedMatchCandidate {
  candidate: TransactionImportCandidate;
  action: "imported" | "matched" | "skipped";
  processedAt: number;
}

export interface RepairedTransactionImportReviewOwnership {
  candidates: TransactionImportCandidate[];
  processedCandidates: ProcessedMatchCandidate[];
  repairedConflictCount: number;
}

export type RegisterMatchOwnership = ReadonlyMap<string, string>;

function matchedRegisterTransactionId(
  candidate: TransactionImportCandidate,
): string | null {
  return candidate.matchedTransaction?.id ?? candidate.matchedTransactionId ?? null;
}

function releaseConflictingRegisterMatch(
  candidate: TransactionImportCandidate,
): TransactionImportCandidate {
  const {
    matchedTransactionId: _matchedTransactionId,
    matchedTransaction: _matchedTransaction,
    evidence: _evidence,
    ...released
  } = candidate;
  return {
    ...released,
    status: "new",
    selected: true,
    reviewDecision: undefined,
    reason: "A conflicting saved match was released. Choose another match or import as new.",
  };
}

export function repairRestoredRegisterMatchOwnership({
  candidates,
  processedCandidates,
}: {
  candidates: TransactionImportCandidate[];
  processedCandidates: ProcessedMatchCandidate[];
}): RepairedTransactionImportReviewOwnership {
  const ownership = new Map<string, string>();
  const repairedCandidates: TransactionImportCandidate[] = [];
  const repairedProcessedCandidates: ProcessedMatchCandidate[] = [];
  let repairedConflictCount = 0;

  for (const entry of processedCandidates) {
    const transactionId =
      entry.action === "matched"
        ? matchedRegisterTransactionId(entry.candidate)
        : null;
    if (transactionId && ownership.has(transactionId)) {
      repairedCandidates.push(releaseConflictingRegisterMatch(entry.candidate));
      repairedConflictCount += 1;
      continue;
    }
    if (transactionId) ownership.set(transactionId, entry.candidate.id);
    repairedProcessedCandidates.push(entry);
  }

  for (const candidate of candidates) {
    const transactionId =
      candidate.status === "exact-match"
        ? matchedRegisterTransactionId(candidate)
        : null;
    if (transactionId && ownership.has(transactionId)) {
      repairedCandidates.push(releaseConflictingRegisterMatch(candidate));
      repairedConflictCount += 1;
      continue;
    }
    if (transactionId) ownership.set(transactionId, candidate.id);
    repairedCandidates.push(candidate);
  }

  if (repairedConflictCount === 0) {
    return {
      candidates,
      processedCandidates,
      repairedConflictCount,
    };
  }

  return {
    candidates: repairedCandidates,
    processedCandidates: repairedProcessedCandidates,
    repairedConflictCount,
  };
}

export function getRegisterMatchOwnership({
  candidates,
  processedCandidates,
}: {
  candidates: readonly TransactionImportCandidate[];
  processedCandidates: readonly ProcessedMatchCandidate[];
}): Map<string, string> {
  const ownership = new Map<string, string>();
  const claim = (candidate: TransactionImportCandidate) => {
    const transactionId = matchedRegisterTransactionId(candidate);
    if (transactionId && !ownership.has(transactionId)) {
      ownership.set(transactionId, candidate.id);
    }
  };

  // Accepted decisions win deterministically if malformed restored state already
  // contains a conflict. The commit validator remains the final safety net.
  processedCandidates
    .filter((entry) => entry.action === "matched")
    .forEach((entry) => claim(entry.candidate));
  candidates
    .filter((candidate) => candidate.status === "exact-match")
    .forEach(claim);

  return ownership;
}

export function getConflictingRegisterMatchOwner(
  ownership: RegisterMatchOwnership,
  candidateId: string,
  transactionId: string,
): string | null {
  const owner = ownership.get(transactionId);
  return owner && owner !== candidateId ? owner : null;
}

export function getAvailableRegisterMatchCandidates(
  candidate: TransactionImportCandidate,
  ownership: RegisterMatchOwnership,
): NonNullable<TransactionImportCandidate["matchCandidates"]> {
  return (candidate.matchCandidates ?? []).filter(
    (option) =>
      !getConflictingRegisterMatchOwner(
        ownership,
        candidate.id,
        option.transaction.id,
      ),
  );
}

export function selectOwnedRegisterMatch(
  candidate: TransactionImportCandidate,
  transactionId: string,
  ownership: RegisterMatchOwnership,
): TransactionImportCandidate {
  if (getConflictingRegisterMatchOwner(ownership, candidate.id, transactionId)) {
    return candidate;
  }

  const selected = candidate.matchCandidates?.find(
    (option) => option.transaction.id === transactionId,
  );
  if (!selected) return candidate;

  return {
    ...candidate,
    status: "exact-match",
    matchedTransactionId: selected.transaction.id,
    matchedTransaction: selected.transaction,
    evidence: selected.evidence,
    reason: selected.reason,
  };
}

export function restoreOwnedRegisterMatch(
  candidate: TransactionImportCandidate,
  matchOrigin: TransactionImportCandidate,
  ownership: RegisterMatchOwnership,
): TransactionImportCandidate {
  const transactionId = matchedRegisterTransactionId(matchOrigin);
  if (
    transactionId &&
    getConflictingRegisterMatchOwner(ownership, candidate.id, transactionId)
  ) {
    return candidate;
  }

  return matchOrigin;
}
