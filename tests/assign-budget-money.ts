import { createBudgetMonth } from "../packages/budget-engine/src/services/createBudgetMonth.js";
import { createCategoryMonth } from "../packages/budget-engine/src/services/createCategoryMonth.js";
import { addIncomeToBudgetMonth } from "../packages/budget-engine/src/services/addIncomeToBudgetMonth.js";
import { assignToCategoryMonth } from "../packages/budget-engine/src/services/assignToCategoryMonth.js";
let budgetMonth = addIncomeToBudgetMonth(
  createBudgetMonth("budget", "2026-06"),
  400000,
);
let rent = createCategoryMonth(budgetMonth.id, "rent");
const result = assignToCategoryMonth(budgetMonth, rent, 180000);
console.log({
  readyToBudget: result.budgetMonth.readyToBudget,
  rent: result.categoryMonth,
});
