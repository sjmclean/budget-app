import { isMoneyNegative, isMoneyZero } from "./moneyMath";

export type BudgetNextMonthOutlookStatus =
  | "overbudget"
  | "balanced"
  | "available";

export interface BudgetNextMonthOutlook {
  readonly status: BudgetNextMonthOutlookStatus;
  readonly amount: number;
}

export function resolveBudgetNextMonthOutlook(
  readyToAssign: number,
): BudgetNextMonthOutlook {
  if (isMoneyNegative(readyToAssign)) {
    return {
      status: "overbudget",
      amount: Math.abs(readyToAssign),
    };
  }

  if (isMoneyZero(readyToAssign)) {
    return {
      status: "balanced",
      amount: 0,
    };
  }

  return {
    status: "available",
    amount: readyToAssign,
  };
}
