import type { BudgetSummary } from "./budgetRegistry";

export function resolveActiveBudgetId(
  budgets: BudgetSummary[],
  selectedBudgetId: string | null,
): string | null {
  if (selectedBudgetId && budgets.some((budget) => budget.id === selectedBudgetId)) {
    return selectedBudgetId;
  }

  return null;
}

export function resolveActiveBudget(
  budgets: BudgetSummary[],
  selectedBudgetId: string | null,
): BudgetSummary | null {
  const activeBudgetId = resolveActiveBudgetId(budgets, selectedBudgetId);

  if (!activeBudgetId) {
    return null;
  }

  return budgets.find((budget) => budget.id === activeBudgetId) ?? null;
}
