import { BudgetMonth } from "../../../types/src/BudgetMonth.js";
import { CategoryMonth } from "../../../types/src/CategoryMonth.js";
import { createBudgetMonth } from "./createBudgetMonth.js";
import { createCategoryMonth } from "./createCategoryMonth.js";
import { leaveOverspent } from "./leaveOverspent.js";

export interface RolloverResult {
  budgetMonth: BudgetMonth;
  categoryMonths: CategoryMonth[];
}

export interface RolloverBudgetMonthOptions {
  readonly overspendingPolicyByCategoryId?: Readonly<
    Record<string, "reduce-next-month" | "carry-category">
  >;
}

/**
 * YNAB4-compatible rollover boundary between two budget months.
 *
 * Positive Available carries forward because that money remains reserved in the
 * envelope. Negative Available follows the category's explicit policy. Existing
 * callers retain the historical `reduce-next-month` default.
 */
export function rolloverBudgetMonth(
  previousMonth: BudgetMonth,
  previousCategoryMonths: CategoryMonth[],
  nextMonth: string,
  options: RolloverBudgetMonthOptions = {},
): RolloverResult {
  let budgetMonth = createBudgetMonth(previousMonth.budgetId, nextMonth, 0, 0, 0);

  const categoryMonths = previousCategoryMonths.map((categoryMonth) => {
    if (categoryMonth.available < 0) {
      if (
        options.overspendingPolicyByCategoryId?.[categoryMonth.categoryId] ===
        "carry-category"
      ) {
        return createCategoryMonth(
          budgetMonth.id,
          categoryMonth.categoryId,
          categoryMonth.available,
          0,
          0,
        );
      }
      budgetMonth = leaveOverspent(budgetMonth, categoryMonth);
      return createCategoryMonth(budgetMonth.id, categoryMonth.categoryId, 0, 0, 0);
    }

    return createCategoryMonth(
      budgetMonth.id,
      categoryMonth.categoryId,
      categoryMonth.available,
      0,
      0
    );
  });

  return { budgetMonth, categoryMonths };
}
