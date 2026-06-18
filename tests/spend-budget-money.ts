import { createBudgetMonth } from "../packages/budget-engine/src/services/createBudgetMonth.js";
import { createCategoryMonth } from "../packages/budget-engine/src/services/createCategoryMonth.js";
import { addIncomeToBudgetMonth } from "../packages/budget-engine/src/services/addIncomeToBudgetMonth.js";
import { assignToCategoryMonth } from "../packages/budget-engine/src/services/assignToCategoryMonth.js";
import { applyActivityToCategoryMonth } from "../packages/budget-engine/src/services/applyActivityToCategoryMonth.js";
let budgetMonth = addIncomeToBudgetMonth(
  createBudgetMonth("budget", "2026-06"),
  400000,
);
let groceries = createCategoryMonth(budgetMonth.id, "groceries");
const assignment = assignToCategoryMonth(budgetMonth, groceries, 50000);
groceries = applyActivityToCategoryMonth(assignment.categoryMonth, -15000);
console.log({ readyToBudget: assignment.budgetMonth.readyToBudget, groceries });
