import { BudgetMonth } from "../../../types/src/BudgetMonth.js";
import { CategoryMonth } from "../../../types/src/CategoryMonth.js";
import { OverspendingDecisionType } from "../../../types/src/OverspendingDecision.js";
import { coverOverspending } from "./coverOverspending.js";
import { leaveOverspent } from "./leaveOverspent.js";

export interface ApplyOverspendingDecisionInput {
  currentBudgetMonth: BudgetMonth;
  nextBudgetMonth: BudgetMonth;
  overspentCategoryMonth: CategoryMonth;
  decision: OverspendingDecisionType;
  coveringCategoryMonth?: CategoryMonth;
  amount?: number;
}

export interface ApplyOverspendingDecisionResult {
  currentBudgetMonth: BudgetMonth;
  nextBudgetMonth: BudgetMonth;
  categoryMonths: CategoryMonth[];
  decision: OverspendingDecisionType;
}

/**
 * Central decision point for cash overspending.
 *
 * The app deliberately does not auto-cover overspending. A caller must pass the
 * user's explicit decision so the budget stays explainable: either move money
 * from a covering category now, or leave the category overspent and reduce the
 * next month's Ready To Assign.
 */
export function applyOverspendingDecision(
  input: ApplyOverspendingDecisionInput,
): ApplyOverspendingDecisionResult {
  if (input.overspentCategoryMonth.available >= 0) {
    return {
      currentBudgetMonth: input.currentBudgetMonth,
      nextBudgetMonth: input.nextBudgetMonth,
      categoryMonths: [input.overspentCategoryMonth],
      decision: input.decision,
    };
  }

  if (input.decision === OverspendingDecisionType.Cover) {
    if (!input.coveringCategoryMonth) {
      throw new Error(
        "Covering category month is required when covering overspending",
      );
    }

    const amount =
      input.amount ?? Math.abs(input.overspentCategoryMonth.available);
    const covered = coverOverspending(
      input.overspentCategoryMonth,
      input.coveringCategoryMonth,
      amount,
    );

    return {
      currentBudgetMonth: input.currentBudgetMonth,
      nextBudgetMonth: input.nextBudgetMonth,
      categoryMonths: [
        covered.overspentCategoryMonth,
        covered.coveringCategoryMonth,
      ],
      decision: input.decision,
    };
  }

  const nextBudgetMonth = leaveOverspent(
    input.nextBudgetMonth,
    input.overspentCategoryMonth,
  );
  return {
    currentBudgetMonth: input.currentBudgetMonth,
    nextBudgetMonth,
    categoryMonths: [input.overspentCategoryMonth],
    decision: input.decision,
  };
}
