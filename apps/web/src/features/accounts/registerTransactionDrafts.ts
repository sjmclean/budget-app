import type {
  NewRegisterTransactionInput,
  UpdateRegisterTransactionInput,
} from "./accountRegisterTypes";
import type { BudgetCategoryOption } from "../budget/budgetViewTypes";
import { findCategoryOption } from "./registerCategoryMatching";
import { type SplitLineDraft } from "./registerSplitDrafts";
import { validateRegisterTransactionDraft } from "./registerTransactionValidation";
import { validIncomeBudgetMonth } from "./incomeBudgetMonth";
import {
  isRegisterIncomeCategoryValue,
  resolveRegisterIncomeCategoryChoice,
} from "./registerIncomeCategoryChoices";

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
  countCategoryInflowAsIncome?: boolean;
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
  payee,
  payeeId,
  transferAccountId,
  category,
  memo,
  checkNumber,
  outflow,
  inflow,
  countCategoryInflowAsIncome = false,
  splitLines,
  categoryOptions,
  requireCompleteSplitDrafts = true,
}: RegisterTransactionDraftInput): Omit<UpdateRegisterTransactionInput, "id"> | null {
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
  if (parsedSplitLines.some((line) => line.categoryId === "__ready_to_assign__")) {
    return null;
  }
  const splitDraftById = new Map(splitLines.map((line) => [line.id, line]));
  const resolvedSplitLines = parsedSplitLines.map((line) => {
    const sourceDraft = splitDraftById.get(line.id);
    const isPositiveInflow =
      line.inflow > 0 &&
      line.outflow === 0 &&
      !line.transferAccountId;
    const splitIncomeCategoryChoice = isPositiveInflow
      ? resolveRegisterIncomeCategoryChoice(line.category, date)
      : null;

    if (
      !splitIncomeCategoryChoice &&
      isRegisterIncomeCategoryValue(line.category)
    ) {
      return null;
    }

    if (splitIncomeCategoryChoice) {
      return {
        ...line,
        category: splitIncomeCategoryChoice.value,
        categoryId: undefined,
        incomeBudgetMonth: splitIncomeCategoryChoice.incomeBudgetMonth,
        inflowClassification: "income" as const,
      };
    }

    const isOrdinaryPositiveCategoryInflow =
      isPositiveInflow &&
      Boolean(line.categoryId) &&
      line.categoryId !== "__ready_to_assign__";

    return {
      ...line,
      incomeBudgetMonth: undefined,
      inflowClassification: isOrdinaryPositiveCategoryInflow
        ? sourceDraft?.countCategoryInflowAsIncome
          ? "income" as const
          : "category-inflow" as const
        : undefined,
    };
  });

  if (resolvedSplitLines.some((line) => line === null)) {
    return null;
  }
  const validatedSplitLines = resolvedSplitLines.filter(
    (line): line is NonNullable<typeof line> => line !== null,
  );

  const categoryName = category.trim();
  const incomeCategoryChoice =
    parsedSplitLines.length === 0 &&
    !transferAccountId &&
    parsedInflow > 0 &&
    parsedOutflow === 0
      ? resolveRegisterIncomeCategoryChoice(categoryName, date)
      : null;
  if (
    !incomeCategoryChoice &&
    isRegisterIncomeCategoryValue(categoryName)
  ) {
    return null;
  }
  const categoryOption = incomeCategoryChoice
    ? undefined
    : findCategoryOption(categoryName, categoryOptions);
  if (categoryOption?.id === "__ready_to_assign__") {
    return null;
  }
  const fallbackCategory = "Uncategorised";
  const categoryId =
    parsedSplitLines.length > 0 || incomeCategoryChoice
      ? undefined
      : categoryOption?.id;
  const resolvedIncomeBudgetMonth = incomeCategoryChoice?.incomeBudgetMonth;
  const directCategoryInflowClassification =
    parsedSplitLines.length === 0 &&
    !transferAccountId &&
    parsedInflow > 0 &&
    parsedOutflow === 0 &&
    categoryOption
      ? countCategoryInflowAsIncome
        ? "income" as const
        : "category-inflow" as const
      : undefined;

  if (
    resolvedIncomeBudgetMonth &&
    !validIncomeBudgetMonth(resolvedIncomeBudgetMonth, date)
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
        : incomeCategoryChoice?.value ??
          (categoryOption?.name ?? (categoryName || fallbackCategory)),
    categoryId,
    incomeBudgetMonth: resolvedIncomeBudgetMonth,
    inflowClassification:
      incomeCategoryChoice ? "income" : directCategoryInflowClassification,
    memo: memo.trim(),
    checkNumber: checkNumber.trim(),
    outflow: parsedOutflow,
    inflow: parsedInflow,
    splitLines:
      validatedSplitLines.length > 0
        ? validatedSplitLines
        : undefined,
  };
}
