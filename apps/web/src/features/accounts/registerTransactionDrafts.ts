import type {
  NewRegisterTransactionInput,
  UpdateRegisterTransactionInput,
} from "./accountRegisterTypes";
import type { BudgetCategoryOption } from "../budget/budgetViewTypes";
import { findCategoryOption } from "./registerCategoryMatching";
import { type SplitLineDraft } from "./registerSplitDrafts";
import { validateRegisterTransactionDraft } from "./registerTransactionValidation";
import { validIncomeBudgetMonth } from "./incomeBudgetMonth";
import { resolveRegisterIncomeCategoryChoice } from "./registerIncomeCategoryChoices";

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
  incomeBudgetMonth,
  memo,
  checkNumber,
  outflow,
  inflow,
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
  const resolvedSplitLines = parsedSplitLines.map((line) => {
    if (
      line.categoryId !== "__ready_to_assign__" ||
      line.inflow <= 0 ||
      line.outflow > 0
    ) {
      return { ...line, incomeBudgetMonth: undefined };
    }

    const splitIncomeBudgetMonth = line.incomeBudgetMonth;
    if (!splitIncomeBudgetMonth || splitIncomeBudgetMonth <= transactionMonth) {
      return { ...line, incomeBudgetMonth: undefined };
    }
    if (!validIncomeBudgetMonth(splitIncomeBudgetMonth, date)) {
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
  const validatedSplitLines = resolvedSplitLines.filter(
    (line): line is NonNullable<typeof line> => line !== null,
  );

  const categoryName = category.trim();
  const incomeCategoryChoice =
    parsedSplitLines.length === 0 &&
    parsedInflow > 0 &&
    parsedOutflow === 0
      ? resolveRegisterIncomeCategoryChoice(categoryName, date)
      : null;
  const categoryOption = incomeCategoryChoice
    ? undefined
    : findCategoryOption(categoryName, categoryOptions);
  const fallbackCategory = "Uncategorised";
  const categoryId =
    parsedSplitLines.length > 0 || incomeCategoryChoice
      ? undefined
      : categoryOption?.id === "__ready_to_assign__"
        ? undefined
        : categoryOption?.id;
  const resolvedIncomeBudgetMonth = incomeCategoryChoice?.incomeBudgetMonth;

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
    inflowClassification: incomeCategoryChoice ? "income" : undefined,
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
