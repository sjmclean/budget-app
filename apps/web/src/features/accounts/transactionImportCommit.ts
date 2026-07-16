import type { NewRegisterTransactionInput } from "./accountRegisterTypes";
import type { TransactionImportCandidate } from "./transactionImport";

/**
 * Convert reviewed import candidates into the register command inputs consumed
 * by the account-register service. This module is deliberately persistence
 * agnostic: the existing register service remains the single owner of writes.
 */
export function buildRegisterTransactionsFromImport(
  candidates: TransactionImportCandidate[],
): NewRegisterTransactionInput[] {
  return candidates
    .filter((candidate) => candidate.selected && candidate.status === "new")
    .map((candidate) => toRegisterTransactionInput(candidate));
}

function toRegisterTransactionInput(
  candidate: TransactionImportCandidate,
): NewRegisterTransactionInput {
  const { parsed } = candidate;
  const isTransfer = Boolean(parsed.transferAccountName);
  const isReadyToAssignIncome =
    !isTransfer && parsed.inflow > 0 && parsed.outflow === 0;

  return {
    date: parsed.date,
    payee: isTransfer
      ? `Transfer: ${parsed.transferAccountName}`
      : parsed.payee,
    category: isTransfer
      ? "Transfer"
      : isReadyToAssignIncome
        ? "Ready to Assign"
        : "Uncategorised",
    categoryId: isTransfer
      ? undefined
      : isReadyToAssignIncome
        ? "__ready_to_assign__"
        : undefined,
    memo: parsed.memo,
    outflow: parsed.outflow,
    inflow: parsed.inflow,
  };
}
