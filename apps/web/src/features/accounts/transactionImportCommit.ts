import type { NewRegisterTransactionInput } from "./accountRegisterTypes";
import type { TransactionImportCandidate } from "./transactionImport";

/**
 * Convert reviewed import candidates into the register command inputs consumed
 * by the account-register service. This module is deliberately persistence
 * agnostic: the existing register service remains the single owner of writes.
 */
export interface BuildRegisterTransactionsFromImportOptions {
  includeMemos?: boolean;
  categories?: Array<{ id: string; name: string }>;
}

export function buildRegisterTransactionsFromImport(
  candidates: TransactionImportCandidate[],
  options: BuildRegisterTransactionsFromImportOptions = {},
): NewRegisterTransactionInput[] {
  return candidates
    .filter((candidate) => candidate.selected && candidate.status === "new")
    .map((candidate) => toRegisterTransactionInput(candidate, options));
}

function toRegisterTransactionInput(
  candidate: TransactionImportCandidate,
  options: BuildRegisterTransactionsFromImportOptions,
): NewRegisterTransactionInput {
  const { parsed } = candidate;
  const proposal = candidate.lifecycle.proposal;
  const isTransfer = Boolean(proposal.transferAccountName);
  const isReadyToAssignIncome =
    !isTransfer && parsed.inflow > 0 && parsed.outflow === 0;

  const requestedCategoryName = proposal.categoryName?.trim() || null;
  const resolvedCategory = requestedCategoryName
    ? options.categories?.find(
        (category) =>
          category.name.trim().toLocaleLowerCase() ===
          requestedCategoryName.toLocaleLowerCase(),
      )
    : undefined;
  const categoryName = isTransfer
    ? "Transfer"
    : isReadyToAssignIncome
      ? "Ready to Assign"
      : resolvedCategory?.name ?? "Uncategorised";

  return {
    date: parsed.date,
    rawPayee: candidate.lifecycle.source.rawPayee,
    payee: isTransfer
      ? `Transfer: ${proposal.transferAccountName}`
      : proposal.payee,
    category: categoryName,
    categoryId: isTransfer
      ? undefined
      : isReadyToAssignIncome
        ? "__ready_to_assign__"
        : resolvedCategory?.id,
    memo: options.includeMemos === false ? undefined : parsed.memo,
    outflow: parsed.outflow,
    inflow: parsed.inflow,
  };
}
