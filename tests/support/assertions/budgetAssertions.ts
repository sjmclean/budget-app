import assert from "node:assert/strict";
import type { BudgetMonth } from "../../../packages/types/src/BudgetMonth.js";
import type { CategoryMonth } from "../../../packages/types/src/CategoryMonth.js";

export function assertBudgetMonth(
  actual: BudgetMonth,
  expected: Partial<Pick<BudgetMonth, "budgetId" | "month" | "income" | "assigned" | "activity" | "readyToBudget">>,
): void {
  for (const [field, value] of Object.entries(expected)) {
    assert.equal(actual[field as keyof BudgetMonth], value, `Expected budget month ${field} to equal ${String(value)}`);
  }
}

export function assertCategoryMonth(
  actual: CategoryMonth,
  expected: Partial<Pick<CategoryMonth, "budgetMonthId" | "categoryId" | "previousAvailable" | "assigned" | "activity" | "available">>,
): void {
  for (const [field, value] of Object.entries(expected)) {
    assert.equal(actual[field as keyof CategoryMonth], value, `Expected category month ${field} to equal ${String(value)}`);
  }
}

export function assertMoneyConserved(before: CategoryMonth[], after: CategoryMonth[]): void {
  const beforeAssigned = before.reduce((sum, item) => sum + item.assigned, 0);
  const afterAssigned = after.reduce((sum, item) => sum + item.assigned, 0);
  assert.equal(afterAssigned, beforeAssigned, "Expected category assignments to be conserved");
}
