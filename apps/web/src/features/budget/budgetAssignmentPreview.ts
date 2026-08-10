import { isMoneyNegative, normaliseMoney } from "./moneyMath";
import type { BudgetMonthView } from "./budgetViewTypes";

/**
 * Produces a presentation-only preview of the direct arithmetic consequences
 * of replacing one category's Assigned value. It deliberately does not derive
 * income, rollover, overspending policy, credit-card funding, or future months.
 * The SQLite budget engine remains authoritative and replaces this view after
 * the write completes.
 */
export function previewCategoryAssignment(
  view: BudgetMonthView,
  categoryId: string,
  assigned: number,
): BudgetMonthView {
  if (!Number.isFinite(assigned)) return view;

  let delta = 0;
  let matched = false;
  const categoryGroups = view.categoryGroups.map((group) => {
    let groupDelta = 0;
    const categories = group.categories.map((category) => {
      if (category.id !== categoryId) return category;
      matched = true;
      groupDelta = normaliseMoney(assigned - category.assigned);
      delta = groupDelta;
      const available = normaliseMoney(category.available + groupDelta);
      return {
        ...category,
        assigned: normaliseMoney(assigned),
        available,
        isOverspent: isMoneyNegative(available),
      };
    });

    return groupDelta === 0
      ? group
      : {
          ...group,
          assigned: normaliseMoney(group.assigned + groupDelta),
          available: normaliseMoney(group.available + groupDelta),
          categories,
        };
  });

  if (!matched) return view;

  return {
    ...view,
    readyToAssign: normaliseMoney(view.readyToAssign - delta),
    totalAssigned: normaliseMoney(view.totalAssigned + delta),
    totalAvailable: normaliseMoney(view.totalAvailable + delta),
    categoryGroups,
  };
}
