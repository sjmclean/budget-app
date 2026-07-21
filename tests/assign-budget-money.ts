import assert from "node:assert/strict";
import { assignToCategoryMonth } from "../packages/budget-engine/src/services/assignToCategoryMonth.js";
import { createCategoryMonth } from "../packages/budget-engine/src/services/createCategoryMonth.js";
import { assertBudgetMonth, assertCategoryMonth } from "./support/assertions/budgetAssertions.js";
import { createFundedBudgetMonth } from "./support/fixtures/budgetMonthFixture.js";

const budgetMonth = createFundedBudgetMonth();
const rent = createCategoryMonth(budgetMonth.id, "rent");
const result = assignToCategoryMonth(budgetMonth, rent, 180_000);

assertBudgetMonth(result.budgetMonth, { income: 400_000, assigned: 180_000, readyToBudget: 220_000 });
assertCategoryMonth(result.categoryMonth, { categoryId: "rent", assigned: 180_000, activity: 0, available: 180_000 });
assertBudgetMonth(budgetMonth, { assigned: 0, readyToBudget: 400_000 });
assert.throws(() => assignToCategoryMonth(budgetMonth, rent, 400_001), /Insufficient Ready To Budget/);
