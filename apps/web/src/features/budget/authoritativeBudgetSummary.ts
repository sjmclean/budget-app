import type { BudgetMonthView } from "./budgetViewTypes";

export interface AuthoritativeBudgetSummary {
  readonly carriedForwardReadyToAssign: number;
  readonly previousOverspending: number;
  readonly incomeForMonth: number;
}

/**
 * Accepts only a complete budget-engine projection. This boundary deliberately
 * does not reconstruct missing values from neighbouring snapshots: doing so
 * would create a second budgeting engine in the UI.
 */
export function readAuthoritativeBudgetSummary(
  view: BudgetMonthView,
): AuthoritativeBudgetSummary | null {
  if (
    view.carriedForwardReadyToAssign === undefined ||
    view.previousOverspending === undefined ||
    view.incomeForMonth === undefined
  ) {
    return null;
  }

  return {
    carriedForwardReadyToAssign: view.carriedForwardReadyToAssign,
    previousOverspending: view.previousOverspending,
    incomeForMonth: view.incomeForMonth,
  };
}
