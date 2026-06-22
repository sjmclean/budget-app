import assert from "node:assert/strict";
import {
  createInitialBudgetRegistry,
  type BudgetSummary,
} from "../apps/web/src/features/budget/budgetRegistry";
import {
  resolveActiveBudget,
  resolveActiveBudgetId,
} from "../apps/web/src/features/budget/activeBudget";

const initial = createInitialBudgetRegistry(new Date("2026-06-22T00:00:00.000Z"));

assert.equal(resolveActiveBudgetId(initial, "household"), "household");
assert.equal(resolveActiveBudget(initial, "household")?.name, "Household Budget");
assert.equal(resolveActiveBudgetId(initial, null), "household");
assert.equal(resolveActiveBudgetId(initial, "missing-budget"), "household");
assert.equal(resolveActiveBudgetId([], "missing-budget"), null);
assert.equal(resolveActiveBudget([], "missing-budget"), null);

const multipleBudgets: BudgetSummary[] = [
  ...initial,
  {
    id: "side-business",
    name: "Side Business",
    currency: "AUD",
    lastOpenedLabel: "Not opened yet",
    packagePath: "~/Budgets/SideBusiness.budget",
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
  },
];

assert.equal(resolveActiveBudgetId(multipleBudgets, "side-business"), "side-business");
assert.equal(resolveActiveBudget(multipleBudgets, "side-business")?.name, "Side Business");

console.log("v1.47 active budget context checks passed");
