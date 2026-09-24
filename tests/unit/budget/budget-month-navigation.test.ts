import assert from "node:assert/strict";
import test from "node:test";

import {
  getNextBudgetMonth,
  getPreviousBudgetMonth,
} from "../../../apps/web/src/features/budget/budgetMonthNavigation.ts";

test("Budget month stepping advances one month and rolls across year boundaries", () => {
  assert.equal(getNextBudgetMonth("2026-09"), "2026-10");
  assert.equal(getPreviousBudgetMonth("2026-09"), "2026-08");
  assert.equal(getNextBudgetMonth("2026-12"), "2027-01");
  assert.equal(getPreviousBudgetMonth("2026-01"), "2025-12");
});
