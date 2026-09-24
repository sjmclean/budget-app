import assert from "node:assert/strict";
import test from "node:test";
import { createInitialBudgetMonthView } from "../../../apps/web/src/features/budget/newBudget/createInitialBudgetMonthView";

test("fresh budgets persist an explicit zero projection anchor", () => {
  const budget = {
    id: "budget-1",
    name: "Fresh budget",
    currency: "AUD",
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z",
  };

  const view = createInitialBudgetMonthView(
    budget,
    {
      name: "Fresh budget",
      currency: "AUD",
      dateFormat: "DD/MM/YYYY",
      numberFormat: "1,234.56",
      firstDayOfWeek: 1,
      categoryGroups: [],
    },
    new Date("2026-09-24T00:00:00.000Z"),
  );

  assert.equal(view.readyToAssign, 0);
  assert.equal(view.carriedForwardReadyToAssign, 0);
  assert.equal(view.previousOverspending, 0);
  assert.equal(view.incomeForMonth, 0);
});
