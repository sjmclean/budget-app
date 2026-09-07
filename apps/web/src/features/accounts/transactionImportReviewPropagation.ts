import type { RegisterTransactionView } from "./accountRegisterTypes";
import { normalisePayeeIdentity } from "./payeeRecognition";
import type { TransactionImportCandidate } from "./transactionImport";

export type ImportReviewPropagationField = "payee" | "category";

export interface ImportReviewManualFields {
  payee?: true;
  category?: true;
}

export type ImportReviewManualEdits = Record<
  string,
  ImportReviewManualFields
>;

export interface HistoricalRegisterPayeeUpdate {
  transaction: RegisterTransactionView;
  payee: string;
}

export interface HistoricalRegisterPayeeMatchResult {
  eligible: HistoricalRegisterPayeeUpdate[];
  reconciledExcluded: number;
}

export function markImportReviewFieldEdited(
  edits: ImportReviewManualEdits,
  candidateId: string,
  field: ImportReviewPropagationField,
): ImportReviewManualEdits {
  return {
    ...edits,
    [candidateId]: {
      ...edits[candidateId],
      [field]: true,
    },
  };
}

export function getImportRawPayeeIdentity(value: string): string {
  return normalisePayeeIdentity(value);
}

export function propagateImportReviewField({
  candidates,
  sourceCandidateId,
  field,
  value,
  manualEdits,
}: {
  candidates: readonly TransactionImportCandidate[];
  sourceCandidateId: string;
  field: ImportReviewPropagationField;
  value: string;
  manualEdits: ImportReviewManualEdits;
}): TransactionImportCandidate[] {
  const sourceCandidate = candidates.find(
    (candidate) => candidate.id === sourceCandidateId,
  );
  if (!sourceCandidate) return [...candidates];

  const sourceIdentity = getImportRawPayeeIdentity(
    sourceCandidate.lifecycle.source.rawPayee,
  );
  if (!sourceIdentity) return [...candidates];

  // A user choosing a transfer is changing transaction semantics, not merely
  // teaching a merchant name. Never project that transfer choice onto sibling
  // bank rows that happen to share the same statement description.
  const sourceIsTransfer = Boolean(
    sourceCandidate.lifecycle.proposal.transferAccountName,
  );

  return candidates.map((candidate) => {
    const isSource = candidate.id === sourceCandidateId;
    const hasSameSource =
      getImportRawPayeeIdentity(candidate.lifecycle.source.rawPayee) ===
      sourceIdentity;

    if (!hasSameSource) return candidate;
    if (!isSource && candidate.status !== "new") return candidate;
    if (!isSource && manualEdits[candidate.id]?.[field]) return candidate;

    const proposal = candidate.lifecycle.proposal;

    if (field === "payee") {
      if (!isSource && (sourceIsTransfer || proposal.transferAccountName)) {
        return candidate;
      }
      return {
        ...candidate,
        lifecycle: {
          ...candidate.lifecycle,
          proposal: {
            ...proposal,
            payee: value,
          },
        },
      };
    }

    if (value === "Split") return candidate;
    if (
      !isSource &&
      (proposal.transferAccountName ||
        proposal.categoryName === "Split" ||
        Boolean(proposal.splitLines?.length))
    ) {
      return candidate;
    }

    return {
      ...candidate,
      lifecycle: {
        ...candidate.lifecycle,
        proposal: {
          ...proposal,
          categoryName: value || null,
          transferAccountName: null,
          splitLines: undefined,
        },
      },
    };
  });
}

export function findHistoricalRegisterPayeeMatches(
  transactions: readonly RegisterTransactionView[],
  sourceRawPayee: string,
  targetPayee: string,
): HistoricalRegisterPayeeMatchResult {
  const sourceIdentity = getImportRawPayeeIdentity(sourceRawPayee);
  const targetIdentity = normalisePayeeIdentity(targetPayee);
  const eligible: HistoricalRegisterPayeeUpdate[] = [];
  let reconciledExcluded = 0;

  if (
    !sourceIdentity ||
    !targetIdentity ||
    targetPayee.trim().toLocaleLowerCase().startsWith("transfer:")
  ) {
    return { eligible, reconciledExcluded };
  }

  for (const transaction of transactions) {
    if (isTransferTransaction(transaction)) continue;

    const transactionSource = transaction.rawPayee?.trim() || transaction.payee;
    if (getImportRawPayeeIdentity(transactionSource) !== sourceIdentity) {
      continue;
    }
    if (normalisePayeeIdentity(transaction.payee) === targetIdentity) {
      continue;
    }
    if (transaction.reconciled) {
      reconciledExcluded += 1;
      continue;
    }

    eligible.push({ transaction, payee: targetPayee.trim() });
  }

  return { eligible, reconciledExcluded };
}

export function isTransferTransaction(
  transaction: Pick<
    RegisterTransactionView,
    | "payee"
    | "transferId"
    | "transferAccountId"
    | "transferTransactionId"
  >,
): boolean {
  return Boolean(
    transaction.transferId ||
      transaction.transferAccountId ||
      transaction.transferTransactionId ||
      transaction.payee.trim().toLocaleLowerCase().startsWith("transfer:"),
  );
}
