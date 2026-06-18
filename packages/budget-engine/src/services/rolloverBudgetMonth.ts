import { BudgetMonth } from "../../../types/src/BudgetMonth.js";
import { CategoryMonth } from "../../../types/src/CategoryMonth.js";
import { createBudgetMonth } from "./createBudgetMonth.js";
import { createCategoryMonth } from "./createCategoryMonth.js";
import { leaveOverspent } from "./leaveOverspent.js";

export interface RolloverResult {
  budgetMonth: BudgetMonth;
  categoryMonths: CategoryMonth[];
}

/**
 * YNAB4-compatible rollover boundary between two budget months.
 *
 * Positive Available carries forward because that money is still reserved in the
 * envelope. Negative Available is not carried as a negative category balance; it
 * is converted into a reduction of the next month's Ready To Assign via
 * `leaveOverspent`. This preserves the explicit overspending policy chosen for
 * the app and keeps the UI from hiding cash overspending inside category rows.
 */
export function rolloverBudgetMonth(
  previousMonth: BudgetMonth,
  previousCategoryMonths: CategoryMonth[],
  nextMonth: string,
): RolloverResult {
  let budgetMonth = createBudgetMonth(
    previousMonth.budgetId,
    nextMonth,
    0,
    0,
    0,
  );

  const categoryMonths = previousCategoryMonths.map((categoryMonth) => {
    if (categoryMonth.available < 0) {
      budgetMonth = leaveOverspent(budgetMonth, categoryMonth);
      return createCategoryMonth(
        budgetMonth.id,
        categoryMonth.categoryId,
        0,
        0,
        0,
      );
    }

    return createCategoryMonth(
      budgetMonth.id,
      categoryMonth.categoryId,
      categoryMonth.available,
      0,
      0,
    );
  });

  return { budgetMonth, categoryMonths };
}
