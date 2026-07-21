import { applyActivityToCategoryMonth } from "../packages/budget-engine/src/services/applyActivityToCategoryMonth.js";
import { rolloverBudgetMonth } from "../packages/budget-engine/src/services/rolloverBudgetMonth.js";
import { assertBudgetMonth, assertCategoryMonth } from "./support/assertions/budgetAssertions.js";
import { createFundedCategory } from "./support/fixtures/budgetMonthFixture.js";

const assignment = createFundedCategory("groceries", 50_000);
const groceries = applyActivityToCategoryMonth(assignment.categoryMonth, -15_000);
const rollover = rolloverBudgetMonth(assignment.budgetMonth, [groceries], "2026-07");

assertBudgetMonth(rollover.budgetMonth, { month: "2026-07", income: 0, assigned: 0, readyToBudget: 0 });
assertCategoryMonth(rollover.categoryMonths[0], { categoryId: "groceries", previousAvailable: 35_000, assigned: 0, activity: 0, available: 35_000 });

const overspent = applyActivityToCategoryMonth(assignment.categoryMonth, -65_000);
const overspentRollover = rolloverBudgetMonth(assignment.budgetMonth, [overspent], "2026-07");
assertBudgetMonth(overspentRollover.budgetMonth, { readyToBudget: -15_000 });
assertCategoryMonth(overspentRollover.categoryMonths[0], { previousAvailable: 0, available: 0 });
