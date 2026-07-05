import type {
  NewRegisterTransactionInput,
  TransactionFlag,
  UpdateRegisterTransactionInput,
} from "./accountRegisterTypes";
import type { BudgetCategoryOption } from "../budget/budgetViewTypes";
import { findCategoryOption } from "./registerCategoryMatching";
import {
  buildSplitLines,
  hasIncompleteSplitDrafts,
  isSplitDraftBalanced,
  parseRegisterMoney,
  type SplitLineDraft,
} from "./registerSplitDrafts";

export interface RegisterTransactionDraftInput {
  date: string;
  flag?: TransactionFlag;
  payee: string;
  payeeId?: string;
  category: string;
  memo: string;
  checkNumber: string;
  outflow: string;
  inflow: string;
  splitLines: SplitLineDraft[];
  categoryOptions: BudgetCategoryOption[];
  requireCompleteSplitDrafts?: boolean;
}

export function buildNewRegisterTransactionInput(
  draft: RegisterTransactionDraftInput,
): NewRegisterTransactionInput | null {
  const input = buildRegisterTransactionInput({
    ...draft,
    requireCompleteSplitDrafts: true,
  });
  return input ? input : null;
}

export function buildUpdateRegisterTransactionInput({
  id,
  ...draft
}: RegisterTransactionDraftInput & {
  id: string;
}): UpdateRegisterTransactionInput | null {
  const input = buildRegisterTransactionInput({
    ...draft,
    requireCompleteSplitDrafts: false,
  });
  return input ? { id, ...input } : null;
}

function buildRegisterTransactionInput({
  date,
  flag,
  payee,
  payeeId,
  category,
  memo,
  checkNumber,
  outflow,
  inflow,
  splitLines,
  categoryOptions,
  requireCompleteSplitDrafts = true,
}: RegisterTransactionDraftInput): Omit<UpdateRegisterTransactionInput, "id"> | null {
  if (!payee.trim()) {
    return null;
  }

  const parsedSplitLines = buildSplitLines(splitLines, categoryOptions);

  if (
    splitLines.length > 0 &&
    (parsedSplitLines.length === 0 ||
      (requireCompleteSplitDrafts && hasIncompleteSplitDrafts(splitLines)))
  ) {
    return null;
  }

  const parsedOutflow = parseRegisterMoney(outflow);
  const parsedInflow = parseRegisterMoney(inflow);

  if (
    splitLines.length > 0 &&
    !isSplitDraftBalanced(parsedOutflow, parsedInflow, splitLines)
  ) {
    return null;
  }

  const categoryName = category.trim();
  const categoryOption = findCategoryOption(categoryName, categoryOptions);
  const fallbackCategory =
    parsedInflow > 0 && parsedOutflow === 0
      ? "Ready to Assign"
      : "Uncategorised";

  return {
    date,
    flag,
    payee: payee.trim(),
    payeeId,
    category:
      parsedSplitLines.length > 0
        ? "Split"
        : (categoryOption?.name ?? (categoryName || fallbackCategory)),
    categoryId:
      parsedSplitLines.length > 0
        ? undefined
        : (categoryOption?.id ??
          (fallbackCategory === "Ready to Assign"
            ? "__ready_to_assign__"
            : undefined)),
    memo: memo.trim(),
    checkNumber: checkNumber.trim(),
    outflow: parsedOutflow,
    inflow: parsedInflow,
    splitLines: parsedSplitLines.length > 0 ? parsedSplitLines : undefined,
  };
}
