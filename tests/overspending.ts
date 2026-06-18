import { createBudgetMonth } from "../packages/budget-engine/src/services/createBudgetMonth.js";
import { createCategoryMonth } from "../packages/budget-engine/src/services/createCategoryMonth.js";
import { addIncomeToBudgetMonth } from "../packages/budget-engine/src/services/addIncomeToBudgetMonth.js";
import { assignToCategoryMonth } from "../packages/budget-engine/src/services/assignToCategoryMonth.js";
import { applyActivityToCategoryMonth } from "../packages/budget-engine/src/services/applyActivityToCategoryMonth.js";
import { coverOverspending } from "../packages/budget-engine/src/services/coverOverspending.js";
import { rolloverBudgetMonth } from "../packages/budget-engine/src/services/rolloverBudgetMonth.js";

let month = addIncomeToBudgetMonth(
  createBudgetMonth("budget", "2026-06"),
  100000,
);

let groceries = createCategoryMonth(month.id, "groceries");
let buffer = createCategoryMonth(month.id, "buffer");

const groceryAssignment = assignToCategoryMonth(month, groceries, 30000);
month = groceryAssignment.budgetMonth;
groceries = groceryAssignment.categoryMonth;

const bufferAssignment = assignToCategoryMonth(month, buffer, 50000);
month = bufferAssignment.budgetMonth;
buffer = bufferAssignment.categoryMonth;

groceries = applyActivityToCategoryMonth(groceries, -45000);

console.log("Overspent:", groceries);

const covered = coverOverspending(groceries, buffer, 15000);

console.log("Covered:", covered);

groceries = applyActivityToCategoryMonth(groceries, -15000);

console.log("Still overspent:", groceries);

console.log(
  "Rollover:",
  rolloverBudgetMonth(month, [groceries, buffer], "2026-07"),
);
