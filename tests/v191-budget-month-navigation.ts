import assert from "node:assert/strict";
import {
  addMonthsToBudgetMonth,
  getCurrentBudgetMonth,
  getNextBudgetMonth,
  getPreviousBudgetMonth,
  normaliseBudgetMonth,
} from "../apps/web/src/features/budget/budgetMonthNavigation.ts";

assert.equal(normaliseBudgetMonth("2026-06"), "2026-06");
assert.equal(getPreviousBudgetMonth("2026-06"), "2026-05");
assert.equal(getNextBudgetMonth("2026-06"), "2026-07");
assert.equal(getPreviousBudgetMonth("2026-01"), "2025-12");
assert.equal(getNextBudgetMonth("2026-12"), "2027-01");
assert.equal(addMonthsToBudgetMonth("2026-06", -18), "2024-12");
assert.equal(addMonthsToBudgetMonth("2026-06", 18), "2027-12");
assert.equal(
  getCurrentBudgetMonth(new Date("2026-06-25T07:44:56.453Z")),
  "2026-06",
);
assert.throws(() => normaliseBudgetMonth("2026-00"), /Invalid budget month/);
assert.throws(() => normaliseBudgetMonth("2026-13"), /Invalid budget month/);
assert.throws(() => normaliseBudgetMonth("2026-6"), /Invalid budget month/);

console.log("v1.91 budget month navigation passed");
