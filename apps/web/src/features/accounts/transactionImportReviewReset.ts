import type { TransactionImportCandidate } from "./transactionImport";
import type { RegisterTransactionView } from "./accountRegisterTypes";
import type {
  HistoricalRegisterPayeeUpdate,
  ImportReviewManualEdits,
} from "./transactionImportReviewPropagation";
import {
  getConflictingRegisterMatchOwner,
  type RegisterMatchOwnership,
} from "./transactionImportReviewOwnership";

export type TransactionImportPreparedCandidates = Record<
  string,
  TransactionImportCandidate
>;

export function capturePreparedTransactionImportCandidates(
  candidates: readonly TransactionImportCandidate[],
): TransactionImportPreparedCandidates {
  return Object.fromEntries(
    candidates.map((candidate) => [candidate.id, structuredClone(candidate)]),
  );
}

function matchedTransactionId(candidate: TransactionImportCandidate): string | null {
  return candidate.matchedTransaction?.id ?? candidate.matchedTransactionId ?? null;
}

export function hasTransactionImportCandidateChanges({
  candidate,
  preparedCandidate,
  manualEdits,
  hasMatchEditorOrigin,
  hasMatchedTransactionOrigin,
  historicalUpdates,
}: {
  candidate: TransactionImportCandidate;
  preparedCandidate?: TransactionImportCandidate;
  manualEdits?: ImportReviewManualEdits[string];
  hasMatchEditorOrigin: boolean;
  hasMatchedTransactionOrigin: boolean;
  historicalUpdates: readonly HistoricalRegisterPayeeUpdate[];
}): boolean {
  if (!preparedCandidate) return false;
  return (
    JSON.stringify(candidate) !== JSON.stringify(preparedCandidate) ||
    Boolean(manualEdits?.payee || manualEdits?.category) ||
    hasMatchEditorOrigin ||
    hasMatchedTransactionOrigin ||
    historicalUpdates.some((update) => update.sourceCandidateId === candidate.id)
  );
}

export function resetTransactionImportCandidate({
  candidates,
  candidateId,
  preparedCandidates,
  manualEdits,
  historicalUpdates,
  matchEditorOrigins,
  matchedTransactionOrigins,
  ownership,
}: {
  candidates: readonly TransactionImportCandidate[];
  candidateId: string;
  preparedCandidates: TransactionImportPreparedCandidates;
  manualEdits: ImportReviewManualEdits;
  historicalUpdates: readonly HistoricalRegisterPayeeUpdate[];
  matchEditorOrigins: Readonly<Record<string, TransactionImportCandidate>>;
  matchedTransactionOrigins: Readonly<Record<string, RegisterTransactionView>>;
  ownership: RegisterMatchOwnership;
}) {
  const preparedCandidate = preparedCandidates[candidateId];
  if (!preparedCandidate) return null;

  const originalMatchId = matchedTransactionId(preparedCandidate);
  if (
    originalMatchId &&
    getConflictingRegisterMatchOwner(ownership, candidateId, originalMatchId)
  ) {
    return { conflict: true as const };
  }

  const nextManualEdits = { ...manualEdits };
  const nextMatchEditorOrigins = { ...matchEditorOrigins };
  const nextMatchedTransactionOrigins = { ...matchedTransactionOrigins };
  delete nextManualEdits[candidateId];
  delete nextMatchEditorOrigins[candidateId];
  delete nextMatchedTransactionOrigins[candidateId];

  return {
    conflict: false as const,
    candidates: candidates.map((candidate) =>
      candidate.id === candidateId ? preparedCandidate : candidate,
    ),
    manualEdits: nextManualEdits,
    historicalUpdates: historicalUpdates.filter(
      (update) => update.sourceCandidateId !== candidateId,
    ),
    matchEditorOrigins: nextMatchEditorOrigins,
    matchedTransactionOrigins: nextMatchedTransactionOrigins,
  };
}
