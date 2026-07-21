import assert from "node:assert/strict";
import { applyActivityToCategoryMonth } from "../packages/budget-engine/src/services/applyActivityToCategoryMonth.js";
import { assignToCategoryMonth } from "../packages/budget-engine/src/services/assignToCategoryMonth.js";
import { coverOverspending } from "../packages/budget-engine/src/services/coverOverspending.js";
import { createCategoryMonth } from "../packages/budget-engine/src/services/createCategoryMonth.js";
import { assertCategoryMonth, assertMoneyConserved } from "./support/assertions/budgetAssertions.js";
import { createFundedBudgetMonth } from "./support/fixtures/budgetMonthFixture.js";

let month = createFundedBudgetMonth(100_000);
let groceries = createCategoryMonth(month.id, "groceries");
let buffer = createCategoryMonth(month.id, "buffer");

({ budgetMonth: month, categoryMonth: groceries } = assignToCategoryMonth(month, groceries, 30_000));
({ budgetMonth: month, categoryMonth: buffer } = assignToCategoryMonth(month, buffer, 50_000));
groceries = applyActivityToCategoryMonth(groceries, -45_000);

const covered = coverOverspending(groceries, buffer, 15_000);
assertMoneyConserved([groceries, buffer], [covered.overspentCategoryMonth, covered.coveringCategoryMonth]);
assertCategoryMonth(covered.overspentCategoryMonth, { assigned: 45_000, activity: -45_000, available: 0 });
assertCategoryMonth(covered.coveringCategoryMonth, { assigned: 35_000, available: 35_000 });

assert.throws(() => coverOverspending(covered.overspentCategoryMonth, covered.coveringCategoryMonth, 1), /not overspent/);
assert.throws(() => coverOverspending(groceries, buffer, 0), /must be positive/);
assert.throws(() => coverOverspending(groceries, buffer, 50_001), /insufficient available funds/);
