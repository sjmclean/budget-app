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
  accounts?: Array<{ id: string; name: string }>;
  identityScope?: string;
}

export function buildRegisterTransactionsFromImport(
  candidates: TransactionImportCandidate[],
  options: BuildRegisterTransactionsFromImportOptions = {},
): NewRegisterTransactionInput[] {
  const selectedCandidates = candidates.filter(
    (candidate) => candidate.selected && candidate.status === "new",
  );
  const identityScope = options.identityScope?.trim();

  if (selectedCandidates.length > 0 && !identityScope) {
    throw new Error(
      "Imported transactions require a stable source identity before commit.",
    );
  }

  return selectedCandidates.map((candidate) =>
    toRegisterTransactionInput(candidate, options, identityScope!),
  );
}

function toRegisterTransactionInput(
  candidate: TransactionImportCandidate,
  options: BuildRegisterTransactionsFromImportOptions,
  identityScope: string,
): NewRegisterTransactionInput {
  const { parsed } = candidate;
  const proposal = candidate.lifecycle.proposal;
  const requestedTransferAccountName =
    proposal.transferAccountName?.trim() || null;
  const resolvedTransferAccount = requestedTransferAccountName
    ? options.accounts?.find(
        (account) => account.name === requestedTransferAccountName,
      )
    : undefined;
  const isTransfer = Boolean(requestedTransferAccountName);
  const requestedCategoryName = proposal.categoryName?.trim() || null;
  const resolvedCategory = requestedCategoryName
    ? options.categories?.find(
        (category) =>
          category.name.trim().toLocaleLowerCase() ===
          requestedCategoryName.toLocaleLowerCase(),
      )
    : undefined;
  const isReadyToAssignIncome =
    !isTransfer &&
    !resolvedCategory &&
    parsed.inflow > 0 &&
    parsed.outflow === 0;

  const categoryName = isTransfer
    ? "Transfer"
    : resolvedCategory?.name ??
      (isReadyToAssignIncome ? "Ready to Assign" : "Uncategorised");

  const transaction: NewRegisterTransactionInput = {
    date: parsed.date,
    rawPayee: candidate.lifecycle.source.rawPayee,
    payee: isTransfer
      ? `Transfer: ${requestedTransferAccountName}`
      : proposal.payee,
    category: categoryName,
    categoryId: isTransfer
      ? undefined
      : resolvedCategory?.id ??
        (isReadyToAssignIncome ? "__ready_to_assign__" : undefined),
    transferAccountId: isTransfer ? resolvedTransferAccount?.id : undefined,
    memo: options.includeMemos === false ? undefined : parsed.memo,
    outflow: parsed.outflow,
    inflow: parsed.inflow,
  };

  // Keep the stable commit-plan identity available to persistence without
  // changing the enumerable command shape consumed by older integrations.
  Object.defineProperty(transaction, "id", {
    value: stableImportTransactionId(candidate, identityScope),
    enumerable: false,
  });
  return transaction;
}

export function stableImportTransactionId(
  candidate: TransactionImportCandidate,
  identityScope: string,
): string {
  const source = candidate.lifecycle.source;
  const identity = [
    identityScope,
    candidate.id,
    source.date,
    source.rawPayee,
    source.inflow,
    source.outflow,
  ].join("\u0000");
  let hash = 0x811c9dc5;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `import-${(hash >>> 0).toString(16).padStart(8, "0")}-${candidate.id}`;
}
