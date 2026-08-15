import type { RegisterSplitLineView, RegisterTransactionView } from "./accountRegisterTypes";

type BudgetParticipation = "on-budget" | "off-budget";

export interface RegisterCategoryAttentionContext {
  readonly accountParticipation?: BudgetParticipation;
}

function hasRealCategory(categoryId: string | undefined): boolean {
  return Boolean(categoryId?.trim());
}

function lineNeedsCategory(
  line: Pick<
    RegisterSplitLineView,
    "categoryId" | "inflow" | "outflow" | "transferAccountId" | "transferAccountParticipation"
  >,
): boolean {
  if (line.inflow === 0 && line.outflow === 0) return false;
  if (hasRealCategory(line.categoryId)) return false;
  if (!line.transferAccountId) return true;
  return line.transferAccountParticipation !== "on-budget";
}

/** Transfer identity is structural. Display strings are deliberately ignored. */
export function isTransferRegisterTransaction(
  transaction: RegisterTransactionView,
): boolean {
  return Boolean(
    transaction.transferAccountId && transaction.transferTransactionId,
  );
}

export function isUncategorisedRegisterTransaction(
  transaction: RegisterTransactionView,
  accountTypeOrContext?:
    | "On budget"
    | "Credit card"
    | "Tracking"
    | RegisterCategoryAttentionContext,
): boolean {
  const accountParticipation =
    typeof accountTypeOrContext === "string"
      ? accountTypeOrContext === "Tracking"
        ? "off-budget"
        : "on-budget"
      : accountTypeOrContext?.accountParticipation ?? "on-budget";

  if (accountParticipation !== "on-budget") return false;
  if (transaction.inflow === 0 && transaction.outflow === 0) return false;

  const splitLines = transaction.splitLines ?? [];
  if (splitLines.length > 0) {
    return splitLines.some(lineNeedsCategory);
  }

  if (hasRealCategory(transaction.categoryId)) return false;
  if (!isTransferRegisterTransaction(transaction)) return true;

  // Only movement wholly inside the budget is category-exempt.
  return transaction.transferAccountParticipation !== "on-budget";
}
