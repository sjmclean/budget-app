import type { RegisterTransactionView } from "./accountRegisterTypes";
import type {
  ImportedTransactionFileType,
  PreviouslyImportedSourceOccurrence,
} from "./transactionImportKnowledge";
import type {
  TransactionImportCandidate,
  TransactionImportPreview,
} from "./transactionImport";
import { stableImportTransactionId } from "./transactionImportCommit";
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
  identityScope?: string | null;
  previouslyImportedSourceOccurrences?: Record<string, PreviouslyImportedSourceOccurrence>;
  sourceFileType?: ImportedTransactionFileType;
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

function normaliseImportSourceText(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
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
    normaliseImportSourceText(payee),
  ].join("|");
}

function createBankSourceComparisonKey({
  date,
  rawPayee,
  memo,
  inflow,
  outflow,
}: {
  date: string;
  rawPayee: string;
  memo?: string;
  inflow: number;
  outflow: number;
}): string {
  return [
    date,
    inflow.toFixed(2),
    outflow.toFixed(2),
    normaliseImportSourceText(rawPayee),
    normaliseImportSourceText(memo),
  ].join("|");
}

function createBankRegisterComparisonKey({
  date,
  rawPayee,
  inflow,
  outflow,
}: {
  date: string;
  rawPayee: string;
  inflow: number;
  outflow: number;
}): string {
  return [
    date,
    inflow.toFixed(2),
    outflow.toFixed(2),
    normaliseImportSourceText(rawPayee),
  ].join("|");
}

export function recoverAlreadyRepresentedBankCandidates(input: {
  candidates: TransactionImportCandidate[];
  existingTransactions: RegisterTransactionView[];
  previouslyImportedSourceOccurrences?: Record<string, PreviouslyImportedSourceOccurrence>;
  allowMigratedYnabBridge?: boolean;
}): {
  reviewCandidates: TransactionImportCandidate[];
  representedCandidates: TransactionImportCandidate[];
} {
  const exactRegisterOccurrences = new Map<string, string[]>();
  const bankRegisterOccurrences = new Map<string, string[]>();
  const migratedBankRegisterOccurrences = new Map<string, string[]>();
  const consumedRegisterOccurrences = new Set<string>();

  for (const [index, transaction] of input.existingTransactions.entries()) {
    const rawPayee = transaction.rawPayee?.trim();
    if (!rawPayee) {
      continue;
    }

    // Both indexes reference the same physical register occurrence. This
    // prevents an occurrence consumed by one recovery route from being reused
    // by the other route later in the same preview.
    const occurrenceId = `${transaction.id}:${index}`;

    const exactKey = createBankSourceComparisonKey({
      date: transaction.date,
      rawPayee,
      memo: transaction.memo,
      inflow: transaction.inflow,
      outflow: transaction.outflow,
    });
    exactRegisterOccurrences.set(exactKey, [
      ...(exactRegisterOccurrences.get(exactKey) ?? []),
      occurrenceId,
    ]);

    const bankKey = createBankRegisterComparisonKey({
      date: transaction.date,
      rawPayee,
      inflow: transaction.inflow,
      outflow: transaction.outflow,
    });
    bankRegisterOccurrences.set(bankKey, [
      ...(bankRegisterOccurrences.get(bankKey) ?? []),
      occurrenceId,
    ]);
    if (transaction.importProvenance === "ynab4-imported-payee") {
      migratedBankRegisterOccurrences.set(bankKey, [
        ...(migratedBankRegisterOccurrences.get(bankKey) ?? []),
        occurrenceId,
      ]);
    }
  }

  const consumeRegisterOccurrence = (
    occurrencesByKey: Map<string, string[]>,
    key: string,
  ): boolean => {
    const occurrences = occurrencesByKey.get(key);
    if (!occurrences) {
      return false;
    }

    while (occurrences.length > 0) {
      const occurrenceId = occurrences.shift();
      if (!occurrenceId || consumedRegisterOccurrences.has(occurrenceId)) {
        continue;
      }

      consumedRegisterOccurrences.add(occurrenceId);
      return true;
    }

    return false;
  };

  const remainingSourceOccurrences = new Map<string, number>();
  for (const evidence of Object.values(
    input.previouslyImportedSourceOccurrences ?? {},
  )) {
    remainingSourceOccurrences.set(
      evidence.identity,
      Math.max(
        remainingSourceOccurrences.get(evidence.identity) ?? 0,
        evidence.occurrenceCount,
      ),
    );
  }

  const consumeHistoricalOccurrence = (
    candidate: TransactionImportCandidate,
  ): boolean => {
    const evidence =
      input.previouslyImportedSourceOccurrences?.[candidate.id];
    if (!evidence) {
      return false;
    }

    const remaining =
      remainingSourceOccurrences.get(evidence.identity) ?? 0;
    if (remaining <= 0) {
      return false;
    }

    remainingSourceOccurrences.set(evidence.identity, remaining - 1);
    return true;
  };

  const reviewCandidates: TransactionImportCandidate[] = [];
  const representedCandidates: TransactionImportCandidate[] = [];

  const canUseRetainedSourceRecovery = (
    candidate: TransactionImportCandidate,
  ): boolean => {
    const evidence =
      input.previouslyImportedSourceOccurrences?.[candidate.id];
    return (
      evidence?.kind !== "external" ||
      evidence.allowRetainedSourceRecovery === true
    );
  };

  for (const candidate of input.candidates) {
    if (candidate.status === "invalid") {
      reviewCandidates.push(candidate);
      continue;
    }

    const source = candidate.lifecycle.source;
    const rawPayee = source.rawPayee.trim();

    if (!rawPayee) {
      reviewCandidates.push(candidate);
      continue;
    }

    const exactKey = createBankSourceComparisonKey({
      date: source.date,
      rawPayee,
      memo: source.memo,
      inflow: source.inflow,
      outflow: source.outflow,
    });
    const bankKey = createBankRegisterComparisonKey({
      date: source.date,
      rawPayee,
      inflow: source.inflow,
      outflow: source.outflow,
    });

    if (
      canUseRetainedSourceRecovery(candidate) &&
      consumeRegisterOccurrence(exactRegisterOccurrences, exactKey)
    ) {
      // Do not allow this same historical source occurrence to be reused
      // later by the memo-independent fallback.
      consumeHistoricalOccurrence(candidate);

      representedCandidates.push(
        appendTransactionImportTrace(candidate, {
          stage: "duplicate-recovery",
          output: {
            represented: true,
            comparisonKey: exactKey,
            source: "retained-bank-fields",
          },
          detail:
            "An existing register transaction with the same retained bank source fields consumed this overlapping import row.",
        }),
      );
      continue;
    }

    if (
      input.allowMigratedYnabBridge === true &&
      consumeRegisterOccurrence(migratedBankRegisterOccurrences, bankKey)
    ) {
      representedCandidates.push(
        appendTransactionImportTrace(candidate, {
          stage: "duplicate-recovery",
          output: {
            represented: true,
            comparisonKey: bankKey,
            source: "ynab4-migrated-bank-provenance",
          },
          detail:
            "A YNAB4-migrated register occurrence with the same retained bank payee, account date, and amount consumed this overlapping import row without relying on an editable memo.",
        }),
      );
      continue;
    }

    const evidence =
      input.previouslyImportedSourceOccurrences?.[candidate.id];
    const historicalAvailable = evidence
      ? remainingSourceOccurrences.get(evidence.identity) ?? 0
      : 0;

    if (
      canUseRetainedSourceRecovery(candidate) &&
      historicalAvailable > 0 &&
      consumeRegisterOccurrence(bankRegisterOccurrences, bankKey)
    ) {
      remainingSourceOccurrences.set(
        evidence!.identity,
        historicalAvailable - 1,
      );

      representedCandidates.push(
        appendTransactionImportTrace(candidate, {
          stage: "duplicate-recovery",
          output: {
            represented: true,
            comparisonKey: bankKey,
            source: "prior-source-and-retained-payee",
          },
          detail:
            "A previously processed bank source occurrence and an existing register transaction with the same retained bank payee, date, and amount consumed this overlapping import row.",
        }),
      );
      continue;
    }

    reviewCandidates.push(candidate);
  }

  return { reviewCandidates, representedCandidates };
}

export function recoverExactDuplicateFileCandidates(input: {
  candidates: TransactionImportCandidate[];
  existingTransactions: RegisterTransactionView[];
  isExactDuplicateFile: boolean;
  identityScope?: string | null;
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
  const registerIds = new Set<string>();
  for (const transaction of input.existingTransactions) {
    registerIds.add(transaction.id);
    const key = createRegisterComparisonKey(transaction);
    registerCounts.set(key, (registerCounts.get(key) ?? 0) + 1);
  }

  const reviewCandidates: TransactionImportCandidate[] = [];
  const representedCandidates: TransactionImportCandidate[] = [];
  const identityScope = input.identityScope?.trim();

  for (const candidate of input.candidates) {
    if (candidate.status === "invalid") {
      reviewCandidates.push(candidate);
      continue;
    }

    if (
      identityScope &&
      registerIds.has(stableImportTransactionId(candidate, identityScope))
    ) {
      representedCandidates.push(
        appendTransactionImportTrace(candidate, {
          stage: "duplicate-recovery",
          output: { represented: true },
          detail:
            "The stable transaction identity already exists for this duplicate-file row.",
        }),
      );
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
  const overlapRecovery = recoverAlreadyRepresentedBankCandidates({
    candidates: suggestedCandidates,
    existingTransactions: input.existingTransactions,
    previouslyImportedSourceOccurrences:
      input.previouslyImportedSourceOccurrences,
    allowMigratedYnabBridge:
      input.sourceFileType === "qif" || input.sourceFileType === "csv",
  });
  const {
    reviewCandidates,
    representedCandidates: duplicateFileRepresentedCandidates,
  } = recoverExactDuplicateFileCandidates({
    candidates: overlapRecovery.reviewCandidates,
    existingTransactions: input.existingTransactions,
    isExactDuplicateFile: input.isExactDuplicateFile,
    identityScope: input.identityScope,
  });
  const representedCandidates = [
    ...overlapRecovery.representedCandidates,
    ...duplicateFileRepresentedCandidates,
  ];
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
