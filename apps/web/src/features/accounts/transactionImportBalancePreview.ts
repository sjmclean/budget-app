import type { TransactionImportCandidate } from "./transactionImport";

export interface TransactionImportBalanceDecision {
  readonly candidate: TransactionImportCandidate;
  readonly action: "imported" | "matched" | "skipped";
}

export function calculateTransactionImportBalancePreview(
  currentWorkingBalance: number,
  decisions: readonly TransactionImportBalanceDecision[],
) {
  const acceptedChange = decisions.reduce((total, decision) => {
    if (decision.action !== "imported") return total;
    return total + decision.candidate.parsed.inflow - decision.candidate.parsed.outflow;
  }, 0);

  return {
    currentWorkingBalance,
    acceptedChange,
    projectedWorkingBalance: currentWorkingBalance + acceptedChange,
  };
}
