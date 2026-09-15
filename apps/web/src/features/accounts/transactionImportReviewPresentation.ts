import type { TransactionImportCandidate } from "./transactionImport";

export type TransactionImportReviewPresentationKind =
  | "suggested-match"
  | "possible-match"
  | "no-match"
  | "invalid";

export interface TransactionImportReviewPresentation {
  kind: TransactionImportReviewPresentationKind;
  title: string;
  subtext: string;
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
    return {
      kind: "suggested-match",
      title: "Suggested match",
      subtext: candidate.reason || "Compare the bank and register transactions before accepting.",
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
