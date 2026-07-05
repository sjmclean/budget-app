import type { RegisterSplitLineView } from "./accountRegisterTypes";
import type { BudgetCategoryOption } from "../budget/budgetViewTypes";
import {
  buildSplitLines,
  hasIncompleteSplitDrafts,
  isSplitDraftBalanced,
  parseRegisterMoney,
  type SplitLineDraft,
} from "./registerSplitDrafts";

export type RegisterTransactionValidationReason =
  | "missing-payee"
  | "invalid-split-lines"
  | "unbalanced-split-lines";

export interface RegisterTransactionValidationInput {
  payee: string;
  outflow: string;
  inflow: string;
  splitLines: SplitLineDraft[];
  categoryOptions: BudgetCategoryOption[];
  requireCompleteSplitDrafts?: boolean;
}

export interface RegisterTransactionValidationResult {
  isValid: boolean;
  reason?: RegisterTransactionValidationReason;
  parsedOutflow: number;
  parsedInflow: number;
  parsedSplitLines: RegisterSplitLineView[];
}

export function validateRegisterTransactionDraft({
  payee,
  outflow,
  inflow,
  splitLines,
  categoryOptions,
  requireCompleteSplitDrafts = true,
}: RegisterTransactionValidationInput): RegisterTransactionValidationResult {
  const parsedOutflow = parseRegisterMoney(outflow);
  const parsedInflow = parseRegisterMoney(inflow);

  if (!payee.trim()) {
    return {
      isValid: false,
      reason: "missing-payee",
      parsedOutflow,
      parsedInflow,
      parsedSplitLines: [],
    };
  }

  const parsedSplitLines = buildSplitLines(splitLines, categoryOptions);

  if (
    splitLines.length > 0 &&
    (parsedSplitLines.length === 0 ||
      (requireCompleteSplitDrafts && hasIncompleteSplitDrafts(splitLines)))
  ) {
    return {
      isValid: false,
      reason: "invalid-split-lines",
      parsedOutflow,
      parsedInflow,
      parsedSplitLines,
    };
  }

  if (
    splitLines.length > 0 &&
    !isSplitDraftBalanced(parsedOutflow, parsedInflow, splitLines)
  ) {
    return {
      isValid: false,
      reason: "unbalanced-split-lines",
      parsedOutflow,
      parsedInflow,
      parsedSplitLines,
    };
  }

  return {
    isValid: true,
    parsedOutflow,
    parsedInflow,
    parsedSplitLines,
  };
}
