import type { RegisterTransactionView } from "./accountRegisterTypes";
import { normaliseMerchant } from "./merchantNormalisation";
import type { ParsedImportTransaction } from "./transactionImportParser";

/**
 * Actual Budget-style reconciliation searches seven days either side of the
 * imported transaction. Exact amount and account scoping are supplied by the
 * caller's register dataset; candidate ordering is deterministic.
 */
export const TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS = 7;

/**
 * Matching candidates remain constrained to ±7 days, but exact-amount
 * competition is measured over a wider ±14-day local window. The wider
 * window provides context only; transactions outside the candidate window
 * can never become matches.
 */
export const TRANSACTION_IMPORT_AMOUNT_COMPETITION_WINDOW_DAYS = 14;

const TRANSACTION_IMPORT_REVIEW_MIN_PAYEE_SIMILARITY = 25;
const TRANSACTION_IMPORT_EXACT_DATE_AUTO_MATCH_SIMILARITY = 85;
const TRANSACTION_IMPORT_NEAR_DATE_AUTO_MATCH_SIMILARITY = 95;
const TRANSACTION_IMPORT_NEAR_DATE_AUTO_MATCH_DAYS = 3;

/**
 * Confidence thresholds are intentionally explicit and provisional. They are
 * expected to be tuned from representative real-world imports rather than
 * relaxed ad hoc for individual examples.
 */
const TRANSACTION_IMPORT_AUTO_MATCH_MIN_SCORE = 80;
const TRANSACTION_IMPORT_AUTO_MATCH_WINNER_MARGIN = 10;

const TRANSACTION_IMPORT_MERCHANT_WEIGHT = 0.7;
const TRANSACTION_IMPORT_DATE_WEIGHT = 0.2;
const TRANSACTION_IMPORT_AMOUNT_COMPETITION_WEIGHT = 0.1;

/** @deprecated Reconciliation now uses one deterministic seven-day window. */
export const HIGH_CONFIDENCE_IMPORT_MATCH_DAYS =
  TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS;
/** @deprecated Reconciliation no longer produces suggested matches. */
export const SUGGESTED_IMPORT_MATCH_DAYS =
  TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS;

export type TransactionImportRecommendation = "import" | "match";

export interface TransactionImportMatchEvidence {
  label: string;
  result: "positive" | "negative" | "neutral";
  detail: string;
}

export interface TransactionImportMatchCandidateAssessment {
  transaction: RegisterTransactionView;
  evidence: TransactionImportMatchEvidence[];
  daysApart: number;
  payeeSimilarity: number;
  merchantMatches: boolean;
  amountCompetitionCount: number;
  matchScore: number;
  automaticMatch: boolean;
  reason: string;
}

export type TransactionImportReconciliationKind = "match" | "new" | "transfer";

export interface TransactionImportTransferAccount {
  id: string;
  name: string;
}

export interface TransactionImportTransferResolution {
  accountName: string;
  accountId?: string;
  status: "resolved" | "missing";
}

export interface TransactionImportMatchAssessment {
  kind: TransactionImportReconciliationKind;
  recommendation: TransactionImportRecommendation;
  status: "exact-match" | "new";
  evidence?: TransactionImportMatchEvidence[];
  reason: string;
  candidates: TransactionImportMatchCandidateAssessment[];
  selectedCandidate?: TransactionImportMatchCandidateAssessment;
  transfer?: TransactionImportTransferResolution;
}

export interface TransactionImportMerchantResolution {
  canonicalPayee: string;
  canonicalPayeeId?: string;
  suggestedCategoryName: string | null;
  transferAccountName: string | null;
  recognitionProvenance?:
    | "explicit-rule"
    | "exact-alias"
    | "exact-canonical"
    | "merchant-inference"
    | "raw";
  recognitionReason?: string;
  aliasId?: string;
  aliasSourcePayee?: string;
}

export interface ReconcileTransactionImportCandidateInput {
  parsed: ParsedImportTransaction;
  existingTransactions: readonly RegisterTransactionView[];
  excludedTransactionIds?: ReadonlySet<string>;
  merchantResolution?: TransactionImportMerchantResolution;
  transferAccounts?: readonly TransactionImportTransferAccount[];
}

/**
 * Reconciles one valid imported row using deterministic evidence:
 * 1. exact signed amount is mandatory;
 * 2. actual candidates are constrained to ±7 days;
 * 3. exact-amount competition is measured locally over ±14 days;
 * 4. trusted merchant identity or sufficiently strong merchant similarity is
 *    required before automatic matching is possible;
 * 5. merchant evidence, graded date proximity, and local amount competition
 *    produce an explainable confidence score;
 * 6. the best automatic candidate must also beat the next credible candidate
 *    by the configured winner margin;
 * 7. each register row may be consumed at most once (handled by excluded IDs).
 *
 * Local amount uniqueness is supporting evidence only. It cannot turn an
 * incompatible merchant into an automatic match, and transactions outside the
 * ±7-day candidate window never become match candidates.
 */
export function reconcileTransactionImportCandidate({
  parsed,
  existingTransactions,
  excludedTransactionIds = new Set<string>(),
  merchantResolution,
  transferAccounts = [],
}: ReconcileTransactionImportCandidateInput): TransactionImportMatchAssessment {
  const transferAccountName = merchantResolution?.transferAccountName?.trim();
  const transferDestination = transferAccountName
    ? findTransferDestinationAccount(transferAccountName, transferAccounts)
    : undefined;
  const unresolvedTransfer =
    transferAccountName && !transferDestination
      ? {
          accountName: transferAccountName,
          status: "missing" as const,
        }
      : undefined;
  if (transferAccountName && transferDestination) {
    return reconcileTransferImportCandidate({
        parsed,
        existingTransactions,
        excludedTransactionIds,
        transferAccountName,
      destination: transferDestination,
    });
  }

  const availableTransactions = existingTransactions.filter(
    (transaction) => !excludedTransactionIds.has(transaction.id),
  );

  const amountCompetitionCount = availableTransactions.filter(
    (transaction) =>
      amountsEqual(transaction, parsed) &&
      daysBetween(transaction.date, parsed.date) <=
        TRANSACTION_IMPORT_AMOUNT_COMPETITION_WINDOW_DAYS,
  ).length;

  const sameAmountDateWindowAnalyses = availableTransactions
    .map((transaction) =>
      analyseImportMatchCandidate(
        transaction,
        parsed,
        merchantResolution,
        amountCompetitionCount,
      ),
    )
    .filter(
      (analysis) =>
        analysis.amountMatches &&
        analysis.daysApart <= TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS,
    );

  const candidates = sameAmountDateWindowAnalyses
    .filter(
      (analysis) =>
        analysis.merchantMatches ||
        analysis.payeeSimilarity >=
          TRANSACTION_IMPORT_REVIEW_MIN_PAYEE_SIMILARITY,
    )
    .sort(compareImportMatchCandidates)
    .map(toCandidateAssessment);

  const ambiguousAutomaticMatch =
    hasAmbiguousAutomaticImportMatch(candidates);
  const selectedCandidate = ambiguousAutomaticMatch
    ? undefined
    : candidates.find((candidate) => candidate.automaticMatch);

  if (!selectedCandidate) {
    return {
      kind: "new",
      recommendation: "import",
      status: "new",
      reason: ambiguousAutomaticMatch
        ? "Multiple register transactions are equally plausible matches; review them manually before choosing one."
        : candidates.length > 0
          ? `Same-amount transactions were found, but none has a compatible merchant; review them manually or import as new.`
          : `No same-amount register transaction was found within ${TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS} days.`,
      candidates,
      transfer: unresolvedTransfer,
    };
  }

  return {
    kind: "match",
    recommendation: "match",
    status: "exact-match",
    evidence: selectedCandidate.evidence,
    reason: buildSelectedMatchReason(selectedCandidate, candidates.length),
    candidates,
    selectedCandidate,
    transfer: unresolvedTransfer,
  };
}

/** Compatibility export for existing callers and tests. */
export function assessTransactionImportMatch(
  parsed: ParsedImportTransaction,
  existingTransactions: readonly RegisterTransactionView[],
  excludedTransactionIds: ReadonlySet<string> = new Set(),
  merchantResolution?: TransactionImportMerchantResolution,
  transferAccounts?: readonly TransactionImportTransferAccount[],
): TransactionImportMatchAssessment {
  return reconcileTransactionImportCandidate({
    parsed,
    existingTransactions,
    excludedTransactionIds,
    merchantResolution,
    transferAccounts,
  });
}

interface ReconcileTransferImportCandidateInput {
  parsed: ParsedImportTransaction;
  existingTransactions: readonly RegisterTransactionView[];
  excludedTransactionIds: ReadonlySet<string>;
  transferAccountName: string;
  destination: TransactionImportTransferAccount;
}

function findTransferDestinationAccount(
  transferAccountName: string,
  transferAccounts: readonly TransactionImportTransferAccount[],
) {
  return transferAccounts.find(
    (account) =>
      account.name.trim().toLocaleLowerCase() ===
      transferAccountName.toLocaleLowerCase(),
  );
}

function reconcileTransferImportCandidate({
  parsed,
  existingTransactions,
  excludedTransactionIds,
  transferAccountName,
  destination,
}: ReconcileTransferImportCandidateInput): TransactionImportMatchAssessment {
  const transfer = {
    accountName: transferAccountName,
    accountId: destination.id,
    status: "resolved" as const,
  };

  const candidates = existingTransactions
    .filter(
      (transaction) =>
        !excludedTransactionIds.has(transaction.id) &&
        transaction.transferAccountId === destination.id,
    )
    .map((transaction) =>
      analyseTransferMatchCandidate(transaction, parsed, transferAccountName),
    )
    .filter(
      (analysis) =>
        analysis.amountMatches &&
        analysis.daysApart <= TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS,
    )
    .sort(compareImportMatchCandidates)
    .map(toCandidateAssessment);
  const selectedCandidate = candidates[0];

  return {
    kind: "transfer",
    recommendation: selectedCandidate ? "match" : "import",
    status: selectedCandidate ? "exact-match" : "new",
    evidence: selectedCandidate?.evidence,
    reason: selectedCandidate
      ? `Matched the closest unused linked transfer to ${transferAccountName}; it is ${formatImportDateDistance(selectedCandidate.daysApart)} away.`
      : `No existing linked transfer to ${transferAccountName} with the same amount was found within ${TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS} days.`,
    candidates,
    selectedCandidate,
    transfer,
  };
}

interface ImportMatchAnalysis {
  transaction: RegisterTransactionView;
  amountMatches: boolean;
  daysApart: number;
  payeeSimilarity: number;
  merchantMatches: boolean;
  amountCompetitionCount: number;
  matchScore: number;
  automaticMatch: boolean;
  evidence: TransactionImportMatchEvidence[];
  reason: string;
}

function analyseTransferMatchCandidate(
  transaction: RegisterTransactionView,
  parsed: ParsedImportTransaction,
  transferAccountName: string,
): ImportMatchAnalysis {
  const amountMatches = amountsEqual(transaction, parsed);
  const daysApart = daysBetween(transaction.date, parsed.date);
  return {
    transaction,
    amountMatches,
    daysApart,
    payeeSimilarity: 100,
    merchantMatches: true,
    amountCompetitionCount: 1,
    matchScore: 100,
    automaticMatch: amountMatches && daysApart <= TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS,
    evidence: [
      {
        label: "Transfer account",
        result: "positive",
        detail: `Linked to ${transferAccountName}.`,
      },
      {
        label: "Amount",
        result: amountMatches ? "positive" : "negative",
        detail: amountMatches ? "Exact signed amount match." : "Amount differs.",
      },
      {
        label: "Date",
        result:
          daysApart === 0
            ? "positive"
            : daysApart <= TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS
              ? "neutral"
              : "negative",
        detail:
          daysApart === 0
            ? "Same date."
            : `${formatImportDateDistance(daysApart)} apart.`,
      },
    ],
    reason: `Linked transfer to ${transferAccountName}, exact amount, ${formatImportDateDistance(daysApart)} apart.`,
  };
}

function analyseImportMatchCandidate(
  transaction: RegisterTransactionView,
  parsed: ParsedImportTransaction,
  merchantResolution: TransactionImportMerchantResolution | undefined,
  amountCompetitionCount: number,
): ImportMatchAnalysis {
  const amountMatches = amountsEqual(transaction, parsed);
  const daysApart = daysBetween(transaction.date, parsed.date);
  const resolvedImportedPayee =
    merchantResolution?.canonicalPayee?.trim() || parsed.payee;
  const existingMerchant = normaliseMerchant(transaction.payee);
  const importedMerchant = normaliseMerchant(resolvedImportedPayee);
  const trustedCanonicalIdentity =
    merchantResolution?.recognitionProvenance === "explicit-rule" ||
    merchantResolution?.recognitionProvenance === "exact-alias" ||
    merchantResolution?.recognitionProvenance === "exact-canonical";
  const canonicalIdMatches = Boolean(
    trustedCanonicalIdentity &&
      merchantResolution?.canonicalPayeeId &&
      transaction.payeeId === merchantResolution.canonicalPayeeId,
  );
  const payeeSimilarity = calculatePayeeSimilarity(
    transaction.payee,
    resolvedImportedPayee,
  );

  const identityMerchantMatches =
    merchantsResolveToSameIdentity(existingMerchant, importedMerchant);

  const inferredMerchantMatches =
    (daysApart === 0 &&
      payeeSimilarity >=
        TRANSACTION_IMPORT_EXACT_DATE_AUTO_MATCH_SIMILARITY) ||
    (daysApart <= TRANSACTION_IMPORT_NEAR_DATE_AUTO_MATCH_DAYS &&
      payeeSimilarity >=
        TRANSACTION_IMPORT_NEAR_DATE_AUTO_MATCH_SIMILARITY);

  const merchantMatches =
    canonicalIdMatches ||
    identityMerchantMatches ||
    inferredMerchantMatches;

  const merchantScore =
    canonicalIdMatches || identityMerchantMatches ? 100 : payeeSimilarity;
  const dateScore = calculateImportDateScore(daysApart);
  const amountCompetitionScore =
    calculateAmountCompetitionScore(amountCompetitionCount);
  const matchScore = calculateImportMatchScore({
    merchantScore,
    dateScore,
    amountCompetitionScore,
  });

  return {
    transaction,
    amountMatches,
    daysApart,
    payeeSimilarity,
    merchantMatches,
    amountCompetitionCount,
    matchScore,
    automaticMatch:
      amountMatches &&
      daysApart <= TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS &&
      merchantMatches &&
      matchScore >= TRANSACTION_IMPORT_AUTO_MATCH_MIN_SCORE,
    evidence: [
      {
        label: "Amount",
        result: amountMatches ? "positive" : "negative",
        detail: amountMatches ? "Exact signed amount match." : "Amount differs.",
      },
      {
        label: "Date",
        result:
          daysApart === 0
            ? "positive"
            : daysApart <= TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS
              ? "neutral"
              : "negative",
        detail:
          daysApart === 0
            ? "Same date."
            : `${formatImportDateDistance(daysApart)} apart.`,
      },
      {
        label: "Merchant",
        result: merchantMatches
          ? "positive"
          : payeeSimilarity > 0
            ? "neutral"
            : "negative",
        detail: merchantMatches
          ? canonicalIdMatches
            ? "Same trusted canonical payee."
            : "Same resolved merchant."
          : `${payeeSimilarity}% normalised payee similarity.`,
      },
      {
        label: "Local amount competition",
        result: amountCompetitionCount === 1 ? "positive" : "neutral",
        detail:
          amountCompetitionCount === 1
            ? `Only one available transaction with this exact signed amount exists within ±${TRANSACTION_IMPORT_AMOUNT_COMPETITION_WINDOW_DAYS} days.`
            : `${amountCompetitionCount} available transactions with this exact signed amount exist within ±${TRANSACTION_IMPORT_AMOUNT_COMPETITION_WINDOW_DAYS} days.`,
      },
      {
        label: "Match confidence",
        result:
          matchScore >= TRANSACTION_IMPORT_AUTO_MATCH_MIN_SCORE
            ? "positive"
            : "neutral",
        detail: `${matchScore}/100 provisional deterministic confidence score.`,
      },
    ],
    reason: merchantMatches
      ? `Same resolved merchant and exact amount, ${formatImportDateDistance(daysApart)} apart.`
      : `Exact amount, ${formatImportDateDistance(daysApart)} apart; ordered after resolved-merchant matches.`,
  };
}

export function hasAmbiguousAutomaticImportMatch(
  candidates: readonly TransactionImportMatchCandidateAssessment[],
): boolean {
  const bestAutomatic = candidates.find(
    (candidate) => candidate.automaticMatch,
  );
  if (!bestAutomatic) return false;

  const nearestCredibleCompetitor = candidates.find(
    (candidate) =>
      candidate !== bestAutomatic &&
      candidate.merchantMatches,
  );
  if (!nearestCredibleCompetitor) return false;

  return (
    bestAutomatic.matchScore - nearestCredibleCompetitor.matchScore <
    TRANSACTION_IMPORT_AUTO_MATCH_WINNER_MARGIN
  );
}

function compareImportMatchCandidates(
  left: ImportMatchAnalysis,
  right: ImportMatchAnalysis,
): number {
  return (
    Number(right.merchantMatches) - Number(left.merchantMatches) ||
    right.matchScore - left.matchScore ||
    left.daysApart - right.daysApart ||
    right.payeeSimilarity - left.payeeSimilarity ||
    left.transaction.date.localeCompare(right.transaction.date) ||
    left.transaction.id.localeCompare(right.transaction.id)
  );
}

function toCandidateAssessment(
  analysis: ImportMatchAnalysis,
): TransactionImportMatchCandidateAssessment {
  return {
    transaction: analysis.transaction,
    evidence: analysis.evidence,
    daysApart: analysis.daysApart,
    payeeSimilarity: analysis.payeeSimilarity,
    merchantMatches: analysis.merchantMatches,
    amountCompetitionCount: analysis.amountCompetitionCount,
    matchScore: analysis.matchScore,
    automaticMatch: analysis.automaticMatch,
    reason: analysis.reason,
  };
}

function buildSelectedMatchReason(
  selected: TransactionImportMatchCandidateAssessment,
  candidateCount: number,
): string {
  const basis = selected.merchantMatches
    ? "same resolved merchant"
    : "closest eligible register transaction";
  const alternatives =
    candidateCount > 1
      ? ` ${candidateCount - 1} other eligible ${candidateCount === 2 ? "option is" : "options are"} available.`
      : "";
  return `Matched by exact amount and ${basis}; dates are ${formatImportDateDistance(selected.daysApart)} apart.${alternatives}`;
}

function merchantsResolveToSameIdentity(
  left: ReturnType<typeof normaliseMerchant>,
  right: ReturnType<typeof normaliseMerchant>,
): boolean {
  if (!left.canonical || !right.canonical) return false;
  if (left.canonical === right.canonical) return true;

  const shorter =
    left.canonical.length <= right.canonical.length ? left : right;
  const longer = shorter === left ? right : left;
  return (
    shorter.tokens.length >= 2 &&
    longer.canonical.startsWith(`${shorter.canonical} `)
  );
}

function calculatePayeeSimilarity(left: string, right: string): number {
  const leftMerchant = normaliseMerchant(left);
  const rightMerchant = normaliseMerchant(right);
  const leftNormalised = leftMerchant.canonical;
  const rightNormalised = rightMerchant.canonical;

  if (!leftNormalised || !rightNormalised) return 0;
  if (leftNormalised === rightNormalised) return 100;

  const leftTokens = leftMerchant.tokens;
  const rightTokens = rightMerchant.tokens;
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;

  const leftTokenSet = new Set(leftTokens);
  const rightTokenSet = new Set(rightTokens);
  const intersection = [...leftTokenSet].filter((token) =>
    rightTokenSet.has(token),
  );
  const union = new Set([...leftTokenSet, ...rightTokenSet]);

  const jaccard =
    union.size > 0
      ? Math.round((intersection.length / union.size) * 100)
      : 0;

  const leftDistinctive = [
    ...new Set(leftTokens.filter((token) => token.length >= 4)),
  ];
  const rightDistinctive = [
    ...new Set(rightTokens.filter((token) => token.length >= 4)),
  ];

  let distinctiveCoverage = 0;

  if (leftDistinctive.length > 0 && rightDistinctive.length > 0) {
    const smaller =
      leftDistinctive.length <= rightDistinctive.length
        ? leftDistinctive
        : rightDistinctive;

    const larger = new Set(
      smaller === leftDistinctive ? rightDistinctive : leftDistinctive,
    );

    const shared = smaller.filter((token) => larger.has(token)).length;

    distinctiveCoverage = Math.round(
      (shared / smaller.length) * 100,
    );
  }

  return Math.max(jaccard, distinctiveCoverage);
}

function calculateImportDateScore(daysApart: number): number {
  if (!Number.isFinite(daysApart) || daysApart > 7) return 0;

  switch (daysApart) {
    case 0:
      return 100;
    case 1:
      return 95;
    case 2:
      return 90;
    case 3:
      return 85;
    case 4:
      return 70;
    case 5:
      return 60;
    case 6:
      return 50;
    case 7:
      return 40;
    default:
      return 0;
  }
}

function calculateAmountCompetitionScore(
  amountCompetitionCount: number,
): number {
  if (amountCompetitionCount <= 1) return 100;
  if (amountCompetitionCount === 2) return 70;
  if (amountCompetitionCount === 3) return 40;
  return 0;
}

function calculateImportMatchScore({
  merchantScore,
  dateScore,
  amountCompetitionScore,
}: {
  merchantScore: number;
  dateScore: number;
  amountCompetitionScore: number;
}): number {
  return Math.round(
    merchantScore * TRANSACTION_IMPORT_MERCHANT_WEIGHT +
      dateScore * TRANSACTION_IMPORT_DATE_WEIGHT +
      amountCompetitionScore *
        TRANSACTION_IMPORT_AMOUNT_COMPETITION_WEIGHT,
  );
}

function formatImportDateDistance(daysApart: number): string {
  if (!Number.isFinite(daysApart)) return "an unknown number of days";
  if (daysApart === 0) return "0 days";
  return `${daysApart} ${daysApart === 1 ? "day" : "days"}`;
}

function amountsEqual(
  transaction: RegisterTransactionView,
  parsed: ParsedImportTransaction,
): boolean {
  return (
    cents(transaction.inflow) === cents(parsed.inflow) &&
    cents(transaction.outflow) === cents(parsed.outflow)
  );
}

function cents(value: number): number {
  return Math.round(value * 100);
}

function daysBetween(left: string, right: string): number {
  const leftDate = Date.parse(`${left}T00:00:00Z`);
  const rightDate = Date.parse(`${right}T00:00:00Z`);
  if (!Number.isFinite(leftDate) || !Number.isFinite(rightDate)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.round(Math.abs(leftDate - rightDate) / 86_400_000);
}
