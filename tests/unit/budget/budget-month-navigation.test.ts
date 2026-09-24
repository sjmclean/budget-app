import assert from "node:assert/strict";
import test from "node:test";

import {
  getBudgetMonthWindow,
  getNextBudgetMonth,
  getPreviousBudgetMonth,
} from "../../../apps/web/src/features/budget/budgetMonthNavigation.ts";

test("Budget month stepping advances one month and rolls across year boundaries", () => {
  assert.equal(getNextBudgetMonth("2026-09"), "2026-10");
  assert.equal(getPreviousBudgetMonth("2026-09"), "2026-08");
  assert.equal(getNextBudgetMonth("2026-12"), "2027-01");
  assert.equal(getPreviousBudgetMonth("2026-01"), "2025-12");
});


test("Budget month window stays centered and crosses year boundaries", () => {
  const decemberWindow = getBudgetMonthWindow("2026-12");
  assert.equal(decemberWindow.length, 11);
  assert.equal(decemberWindow[5], "2026-12");
  assert.equal(decemberWindow[6], "2027-01");
  assert.deepEqual(
    decemberWindow.slice(3, 8),
    ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02"],
  );

  const januaryWindow = getBudgetMonthWindow("2027-01", 2);
  assert.deepEqual(
    januaryWindow,
    ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03"],
  );
});
