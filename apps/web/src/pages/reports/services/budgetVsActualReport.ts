import { budgetVsActual, type BudgetVsActualRow } from "../../../../../../packages/budget-engine/src/reports/budgetVsActual";
import type { BudgetMonthView } from "../../../features/budget/budgetViewTypes";

export type { BudgetVsActualRow };

export function buildBudgetVsActualRows(budgetView: BudgetMonthView | null): BudgetVsActualRow[] {
  if (!budgetView) return [];

  return budgetVsActual(
    budgetView.categoryGroups.flatMap((group) =>
      group.categories.map((category) => ({
        categoryId: category.id,
        categoryName: category.name,
        groupName: group.name,
        assigned: category.assigned,
        activity: category.activity,
        available: category.available,
        isArchived: category.isArchived,
      })),
    ),
  );
}

export function calculateBudgetVsActualTotals(rows: BudgetVsActualRow[]) {
  return rows.reduce(
    (totals, row) => ({
      assigned: totals.assigned + row.assigned,
      activity: totals.activity + row.activity,
      available: totals.available + row.available,
      overspentCount: totals.overspentCount + (row.status === "overspent" ? 1 : 0),
    }),
    { assigned: 0, activity: 0, available: 0, overspentCount: 0 },
  );
}
