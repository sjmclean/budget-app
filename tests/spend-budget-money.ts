import { applyActivityToCategoryMonth } from "../packages/budget-engine/src/services/applyActivityToCategoryMonth.js";
import { assertBudgetMonth, assertCategoryMonth } from "./support/assertions/budgetAssertions.js";
import { createFundedCategory } from "./support/fixtures/budgetMonthFixture.js";

const assignment = createFundedCategory("groceries", 50_000);
const groceries = applyActivityToCategoryMonth(assignment.categoryMonth, -15_000);

assertBudgetMonth(assignment.budgetMonth, { assigned: 50_000, readyToBudget: 350_000 });
assertCategoryMonth(groceries, { categoryId: "groceries", assigned: 50_000, activity: -15_000, available: 35_000 });
assertCategoryMonth(assignment.categoryMonth, { activity: 0, available: 50_000 });
