import type { BudgetCategoryView } from "./budgetViewTypes";
import { isCreditCardPaymentCategory } from "./creditCardPaymentCategories";
import { isMoneyNegative } from "./moneyMath";

export type BudgetCategoryWindowTab = "cover-overspending" | "settings";

export function canCategoryUseCoverOverspending(category: BudgetCategoryView) {
  return isMoneyNegative(category.available) &&
    !category.isArchived &&
    !isCreditCardPaymentCategory(category.id);
}

export function resolveBudgetCategoryWindowTab(
  category: BudgetCategoryView,
  requestedTab?: BudgetCategoryWindowTab,
): BudgetCategoryWindowTab {
  if (requestedTab === "cover-overspending" && canCategoryUseCoverOverspending(category)) {
    return requestedTab;
  }
  if (requestedTab === "settings") return requestedTab;
  return canCategoryUseCoverOverspending(category) ? "cover-overspending" : "settings";
}
