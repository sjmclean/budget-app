import type { RegisterTransactionView } from "./accountRegisterTypes";
import { normaliseMerchant } from "./merchantNormalisation";
import type { ParsedImportTransaction } from "./transactionImportParser";

/**
 * Actual Budget-style reconciliation searches seven days either side of the
 * imported transaction. Exact amount and account scoping are supplied by the
 * caller's register dataset; candidate ordering is deterministic.
 */
export const TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS = 7;

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
 * Reconciles one valid imported row using deterministic passes inspired by
 * Actual Budget:
 * 1. same signed amount within ±7 days;
 * 2. prefer the same resolved/canonical merchant;
 * 3. within each group choose the closest date;
 * 4. consume each register row at most once (handled by excluded IDs).
 *
 * Only an exact signed amount, compatible date and compatible merchant is an
 * automatic match. Same-amount/date rows with a different merchant remain
 * visible as manual candidates but are imported as new unless the user chooses
 * one explicitly.
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

  const candidates = existingTransactions
    .filter((transaction) => !excludedTransactionIds.has(transaction.id))
    .map((transaction) =>
      analyseImportMatchCandidate(transaction, parsed, merchantResolution),
    )
    .filter(
      (analysis) =>
        analysis.amountMatches &&
        analysis.daysApart <= TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS,
    )
    .sort(compareImportMatchCandidates)
    .map(toCandidateAssessment);

  const selectedCandidate = candidates.find((candidate) => candidate.automaticMatch);
  if (!selectedCandidate) {
    return {
      kind: "new",
      recommendation: "import",
      status: "new",
      reason: candidates.length > 0
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
  merchantResolution?: TransactionImportMerchantResolution,
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
  const merchantMatches =
    canonicalIdMatches ||
    merchantsResolveToSameIdentity(existingMerchant, importedMerchant);
  const payeeSimilarity = calculatePayeeSimilarity(
    transaction.payee,
    resolvedImportedPayee,
  );

  return {
    transaction,
    amountMatches,
    daysApart,
    payeeSimilarity,
    merchantMatches,
    automaticMatch:
      amountMatches &&
      daysApart <= TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS &&
      merchantMatches,
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
    ],
    reason: merchantMatches
      ? `Same resolved merchant and exact amount, ${formatImportDateDistance(daysApart)} apart.`
      : `Exact amount, ${formatImportDateDistance(daysApart)} apart; ordered after resolved-merchant matches.`,
  };
}

function compareImportMatchCandidates(
  left: ImportMatchAnalysis,
  right: ImportMatchAnalysis,
): number {
  return (
    Number(right.merchantMatches) - Number(left.merchantMatches) ||
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

  const rightTokenSet = new Set(rightTokens);
  const overlap = leftTokens.filter((token) => rightTokenSet.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return Math.round((overlap / union) * 100);
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
