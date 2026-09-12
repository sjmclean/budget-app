import type { TransactionImportCandidate } from "./transactionImport";

interface ProcessedMatchCandidate {
  candidate: TransactionImportCandidate;
  action: "imported" | "matched" | "skipped";
}

export type RegisterMatchOwnership = ReadonlyMap<string, string>;

function matchedRegisterTransactionId(
  candidate: TransactionImportCandidate,
): string | null {
  return candidate.matchedTransaction?.id ?? candidate.matchedTransactionId ?? null;
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
