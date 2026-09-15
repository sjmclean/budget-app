import type { TransactionImportCandidate } from "./transactionImport";
import type { ImportReviewManualFields } from "./transactionImportReviewPropagation";

/**
 * Synchronise only source-derived proposal memo state with the import
 * preference. Explicit review edits own their proposal value and are retained.
 */
export function applySourceMemoPreferenceToCandidate({
  candidate,
  excludeMemos,
  manualEdits,
}: {
  candidate: TransactionImportCandidate;
  excludeMemos: boolean;
  manualEdits?: ImportReviewManualFields;
}): TransactionImportCandidate {
  if (manualEdits?.memo || candidate.status === "exact-match") {
    return candidate;
  }

  const memo = excludeMemos ? undefined : candidate.lifecycle.source.memo;
  if (candidate.lifecycle.proposal.memo === memo) return candidate;

  return {
    ...candidate,
    lifecycle: {
      ...candidate.lifecycle,
      proposal: {
        ...candidate.lifecycle.proposal,
        memo,
      },
    },
  };
}
