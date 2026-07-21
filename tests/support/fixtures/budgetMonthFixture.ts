import { addIncomeToBudgetMonth } from "../../../packages/budget-engine/src/services/addIncomeToBudgetMonth.js";
import { assignToCategoryMonth } from "../../../packages/budget-engine/src/services/assignToCategoryMonth.js";
import { createBudgetMonth } from "../../../packages/budget-engine/src/services/createBudgetMonth.js";
import { createCategoryMonth } from "../../../packages/budget-engine/src/services/createCategoryMonth.js";
import type { BudgetMonth } from "../../../packages/types/src/BudgetMonth.js";
import type { CategoryMonth } from "../../../packages/types/src/CategoryMonth.js";

export interface FundedCategoryFixture {
  budgetMonth: BudgetMonth;
  categoryMonth: CategoryMonth;
}

export function createFundedBudgetMonth(income = 400_000, month = "2026-06"): BudgetMonth {
  return addIncomeToBudgetMonth(createBudgetMonth("budget", month), income);
}

export function createFundedCategory(
  categoryId: string,
  assigned: number,
  income = 400_000,
): FundedCategoryFixture {
  const budgetMonth = createFundedBudgetMonth(income);
  const categoryMonth = createCategoryMonth(budgetMonth.id, categoryId);
  return assignToCategoryMonth(budgetMonth, categoryMonth, assigned);
}
