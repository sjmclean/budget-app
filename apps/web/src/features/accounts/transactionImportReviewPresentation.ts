import type { TransactionImportCandidate } from "./transactionImport";
import { MANUAL_IMPORT_MATCH_REASON } from "./transactionImportReviewOwnership";

export type TransactionImportReviewPresentationKind =
  | "suggested-match"
  | "selected-match"
  | "possible-match"
  | "no-match"
  | "invalid";

export interface TransactionImportReviewPresentation {
  kind: TransactionImportReviewPresentationKind;
  title: string;
  subtext: string;
}

export type TransactionImportSecondaryRowKind =
  | "possible-match"
  | "proposal"
  | "none";

function normaliseReviewText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function hasTransactionImportProposalDifference(
  candidate: TransactionImportCandidate,
): boolean {
  const source = candidate.lifecycle.source;
  const proposal = candidate.lifecycle.proposal;

  return (
    normaliseReviewText(source.rawPayee) !== normaliseReviewText(proposal.payee) ||
    normaliseReviewText(source.importedCategoryName) !==
      normaliseReviewText(proposal.categoryName) ||
    normaliseReviewText(source.transferAccountName) !==
      normaliseReviewText(proposal.transferAccountName) ||
    normaliseReviewText(source.memo) !== normaliseReviewText(proposal.memo) ||
    (proposal.tagIds?.length ?? 0) > 0 ||
    (proposal.attachments?.length ?? 0) > 0 ||
    (proposal.splitLines?.length ?? 0) > 0
  );
}

export function getTransactionImportSecondaryRowKind(
  candidate: TransactionImportCandidate,
  availableMatchCount: number,
): TransactionImportSecondaryRowKind {
  if (candidate.status !== "new") {
    return "none";
  }

  if (candidate.reviewDecision === "import-as-new") {
    return "proposal";
  }

  if (availableMatchCount > 0) {
    return "possible-match";
  }

  return hasTransactionImportProposalDifference(candidate)
    ? "proposal"
    : "none";
}

function isManuallySelectedMatch(candidate: TransactionImportCandidate): boolean {
  return (
    candidate.status === "exact-match" &&
    candidate.reason === MANUAL_IMPORT_MATCH_REASON
  );
}

export function getTransactionImportReviewPresentation(
  candidate: TransactionImportCandidate,
  availableMatchCount: number,
): TransactionImportReviewPresentation {
  if (candidate.status === "invalid") {
    return {
      kind: "invalid",
      title: "Needs correction",
      subtext: candidate.reason || "Correct the source settings or skip this transaction.",
    };
  }
  if (candidate.status === "exact-match") {
    if (isManuallySelectedMatch(candidate)) {
      return {
        kind: "selected-match",
        title: "Selected match",
        subtext: "You selected this register transaction.",
      };
    }
    return {
      kind: "suggested-match",
      title: "Suggested match",
      subtext: candidate.reason || "Compare the bank and register transactions before accepting.",
    };
  }
  if (candidate.reviewDecision === "import-as-new") {
    return {
      kind: "no-match",
      title: "Ready to import",
      subtext:
        availableMatchCount > 0
          ? "The possible match was rejected. Review the proposed transaction before importing."
          : "Review the proposed transaction before importing.",
    };
  }
  if (availableMatchCount > 0) {
    return {
      kind: "possible-match",
      title: "Possible match",
      subtext: `${availableMatchCount} possible match${availableMatchCount === 1 ? "" : "es"} found.`,
    };
  }
  return {
    kind: "no-match",
    title: "No match found",
    subtext: candidate.reconciliationKind === "transfer"
      ? candidate.transferResolution?.status === "resolved"
        ? `Ready to import transfer to ${candidate.transferResolution.accountName}.`
        : "Choose a valid transfer account before importing."
      : "Ready to import.",
  };
}
