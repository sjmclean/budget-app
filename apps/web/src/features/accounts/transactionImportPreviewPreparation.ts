import type { RegisterTransactionView } from "./accountRegisterTypes";
import type {
  TransactionImportCandidate,
  TransactionImportPreview,
} from "./transactionImport";
import { applyTransactionImportMerchantProposal } from "./transactionImportMerchantProposal";
import { appendTransactionImportTrace } from "./transactionImportTrace";

export interface TransactionImportIdentityPartition {
  activeCandidates: TransactionImportCandidate[];
  previouslyImportedCandidates: TransactionImportCandidate[];
  alreadyRepresentedCandidates: TransactionImportCandidate[];
}

export interface PrepareTransactionImportPreviewInput {
  partition: TransactionImportIdentityPartition;
  existingTransactions: RegisterTransactionView[];
  isExactDuplicateFile: boolean;
}

export interface PreparedTransactionImportPreview {
  preview: TransactionImportPreview;
  reviewCandidates: TransactionImportCandidate[];
  bankCandidateDetails: Record<
    string,
    TransactionImportCandidate["parsed"]
  >;
  previouslyImportedCount: number;
  alreadyRepresentedCount: number;
  totalExistingCount: number;
}

export function getCandidateProposalTransaction(
  candidate: TransactionImportCandidate,
): TransactionImportCandidate["parsed"] {
  const proposal = candidate.lifecycle.proposal;
  return {
    ...candidate.parsed,
    payee: proposal.payee,
    transferAccountName: proposal.transferAccountName ?? undefined,
    importedCategoryName: proposal.categoryName ?? undefined,
  };
}

export function applyMerchantProposals(
  candidates: TransactionImportCandidate[],
): TransactionImportCandidate[] {
  return candidates.map((candidate) =>
    applyTransactionImportMerchantProposal({ candidate }),
  );
}

function normalisePayee(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function createRegisterComparisonKey({
  date,
  payee,
  inflow,
  outflow,
}: {
  date: string;
  payee: string;
  inflow: number;
  outflow: number;
}): string {
  return [
    date,
    inflow.toFixed(2),
    outflow.toFixed(2),
    normalisePayee(payee),
  ].join("|");
}

export function recoverExactDuplicateFileCandidates(input: {
  candidates: TransactionImportCandidate[];
  existingTransactions: RegisterTransactionView[];
  isExactDuplicateFile: boolean;
}): {
  reviewCandidates: TransactionImportCandidate[];
  representedCandidates: TransactionImportCandidate[];
} {
  if (!input.isExactDuplicateFile) {
    return {
      reviewCandidates: input.candidates,
      representedCandidates: [],
    };
  }

  const registerCounts = new Map<string, number>();
  for (const transaction of input.existingTransactions) {
    const key = createRegisterComparisonKey(transaction);
    registerCounts.set(key, (registerCounts.get(key) ?? 0) + 1);
  }

  const reviewCandidates: TransactionImportCandidate[] = [];
  const representedCandidates: TransactionImportCandidate[] = [];

  for (const candidate of input.candidates) {
    if (candidate.status === "invalid") {
      reviewCandidates.push(candidate);
      continue;
    }

    const key = createRegisterComparisonKey(
      getCandidateProposalTransaction(candidate),
    );
    const available = registerCounts.get(key) ?? 0;

    if (available > 0) {
      registerCounts.set(key, available - 1);
      representedCandidates.push(
        appendTransactionImportTrace(candidate, {
          stage: "duplicate-recovery",
          output: { represented: true, comparisonKey: key },
          detail: "An existing register occurrence consumed this duplicate-file row.",
        }),
      );
    } else {
      reviewCandidates.push(
        appendTransactionImportTrace(candidate, {
          stage: "duplicate-recovery",
          output: { represented: false, comparisonKey: key },
          detail: "No remaining register occurrence represented this duplicate-file row.",
        }),
      );
    }
  }

  return { reviewCandidates, representedCandidates };
}

export function buildTransactionImportPreview(
  candidates: TransactionImportCandidate[],
): TransactionImportPreview {
  return {
    candidates,
    summary: {
      totalRows: candidates.length,
      newTransactions: candidates.filter(
        (candidate) => candidate.status === "new",
      ).length,
      exactMatches: candidates.filter(
        (candidate) => candidate.status === "exact-match",
      ).length,
      possibleMatches: 0,
      invalidRows: candidates.filter(
        (candidate) => candidate.status === "invalid",
      ).length,
      selectedForImport: candidates.filter((candidate) => candidate.selected)
        .length,
    },
  };
}

export function prepareTransactionImportPreview(
  input: PrepareTransactionImportPreviewInput,
): PreparedTransactionImportPreview {
  const suggestedCandidates = applyMerchantProposals(
    input.partition.activeCandidates,
  );
  const { reviewCandidates, representedCandidates } =
    recoverExactDuplicateFileCandidates({
      candidates: suggestedCandidates,
      existingTransactions: input.existingTransactions,
      isExactDuplicateFile: input.isExactDuplicateFile,
    });
  const previouslyImportedCount =
    input.partition.previouslyImportedCandidates.length;
  const alreadyRepresentedCount =
    input.partition.alreadyRepresentedCandidates.length +
    representedCandidates.length;

  return {
    preview: buildTransactionImportPreview(reviewCandidates),
    reviewCandidates,
    bankCandidateDetails: Object.fromEntries(
      input.partition.activeCandidates.map((candidate) => [
        candidate.id,
        { ...candidate.parsed },
      ]),
    ),
    previouslyImportedCount,
    alreadyRepresentedCount,
    totalExistingCount: previouslyImportedCount + alreadyRepresentedCount,
  };
}
