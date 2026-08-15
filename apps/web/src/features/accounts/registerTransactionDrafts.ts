import type {
  NewRegisterTransactionInput,
  UpdateRegisterTransactionInput,
} from "./accountRegisterTypes";
import type { BudgetCategoryOption } from "../budget/budgetViewTypes";
import { findCategoryOption } from "./registerCategoryMatching";
import { type SplitLineDraft } from "./registerSplitDrafts";
import { validateRegisterTransactionDraft } from "./registerTransactionValidation";

export interface RegisterTransactionDraftInput {
  date: string;
  payee: string;
  payeeId?: string;
  transferAccountId?: string;
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
  }, true);
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
  }, false);
  return input ? { id, ...input } : null;
}

function buildRegisterTransactionInput({
  date,
  payee,
  payeeId,
  transferAccountId,
  category,
  memo,
  checkNumber,
  outflow,
  inflow,
  splitLines,
  categoryOptions,
  requireCompleteSplitDrafts = true,
}: RegisterTransactionDraftInput, defaultBlankInflowToReadyToAssign: boolean): Omit<UpdateRegisterTransactionInput, "id"> | null {
  const validation = validateRegisterTransactionDraft({
    payee,
    outflow,
    inflow,
    splitLines,
    categoryOptions,
    requireCompleteSplitDrafts,
  });

  if (!validation.isValid) {
    return null;
  }

  const { parsedOutflow, parsedInflow, parsedSplitLines } = validation;

  const categoryName = category.trim();
  const categoryOption = findCategoryOption(categoryName, categoryOptions);
  const fallbackCategory =
    defaultBlankInflowToReadyToAssign &&
    categoryName.length === 0 &&
    parsedInflow > 0 &&
    parsedOutflow === 0
      ? "Ready to Assign"
      : "Uncategorised";

  return {
    date,
    payee: payee.trim(),
    payeeId,
    transferAccountId,
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
