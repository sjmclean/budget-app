import type {
  NewRegisterTransactionInput,
  UpdateRegisterTransactionInput,
} from "./accountRegisterTypes";
import type { BudgetCategoryOption } from "../budget/budgetViewTypes";
import { findCategoryOption } from "./registerCategoryMatching";
import { type SplitLineDraft } from "./registerSplitDrafts";
import { validateRegisterTransactionDraft } from "./registerTransactionValidation";
import { validIncomeBudgetMonth } from "./incomeBudgetMonth";

export interface RegisterTransactionDraftInput {
  date: string;
  payee: string;
  payeeId?: string;
  transferAccountId?: string;
  category: string;
  incomeBudgetMonth?: string;
  latestIncomeBudgetMonth?: string;
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
  incomeBudgetMonth,
  latestIncomeBudgetMonth,
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

  const transactionMonth = date.slice(0, 7);
  const resolvedSplitLines = parsedSplitLines.map((line) => {
    if (
      line.categoryId !== "__ready_to_assign__" ||
      line.inflow <= 0 ||
      line.outflow > 0
    ) {
      return { ...line, incomeBudgetMonth: undefined };
    }

    const splitIncomeBudgetMonth = line.incomeBudgetMonth || transactionMonth;
    if (
      !validIncomeBudgetMonth(
        splitIncomeBudgetMonth,
        date,
        latestIncomeBudgetMonth,
      )
    ) {
      return null;
    }

    return {
      ...line,
      incomeBudgetMonth: splitIncomeBudgetMonth,
    };
  });

  if (resolvedSplitLines.some((line) => line === null)) {
    return null;
  }

  const categoryName = category.trim();
  const categoryOption = findCategoryOption(categoryName, categoryOptions);
  const fallbackCategory =
    defaultBlankInflowToReadyToAssign &&
    categoryName.length === 0 &&
    parsedInflow > 0 &&
    parsedOutflow === 0
      ? "Ready to Assign"
      : "Uncategorised";
  const categoryId =
    parsedSplitLines.length > 0
      ? undefined
      : (categoryOption?.id ??
        (fallbackCategory === "Ready to Assign"
          ? "__ready_to_assign__"
          : undefined));
  const resolvedIncomeBudgetMonth =
    categoryId === "__ready_to_assign__" &&
    parsedInflow > 0 &&
    parsedOutflow === 0
      ? (incomeBudgetMonth || transactionMonth)
      : undefined;

  if (
    resolvedIncomeBudgetMonth &&
    !validIncomeBudgetMonth(
      resolvedIncomeBudgetMonth,
      date,
      latestIncomeBudgetMonth,
    )
  ) {
    return null;
  }

  return {
    date,
    payee: payee.trim(),
    payeeId,
    transferAccountId,
    category:
      parsedSplitLines.length > 0
        ? "Split"
        : (categoryOption?.name ?? (categoryName || fallbackCategory)),
    categoryId,
    incomeBudgetMonth: resolvedIncomeBudgetMonth,
    memo: memo.trim(),
    checkNumber: checkNumber.trim(),
    outflow: parsedOutflow,
    inflow: parsedInflow,
    splitLines:
      resolvedSplitLines.length > 0
        ? resolvedSplitLines
        : undefined,
  };
}
