import { createBudgetMonth } from "../packages/budget-engine/src/services/createBudgetMonth.js";
import { createCategoryMonth } from "../packages/budget-engine/src/services/createCategoryMonth.js";
import { addIncomeToBudgetMonth } from "../packages/budget-engine/src/services/addIncomeToBudgetMonth.js";
import { assignToCategoryMonth } from "../packages/budget-engine/src/services/assignToCategoryMonth.js";
import { applyActivityToCategoryMonth } from "../packages/budget-engine/src/services/applyActivityToCategoryMonth.js";
import { rolloverBudgetMonth } from "../packages/budget-engine/src/services/rolloverBudgetMonth.js";
let june = addIncomeToBudgetMonth(createBudgetMonth("budget", "2026-06"), 400000); let groceries = createCategoryMonth(june.id, "groceries"); const assigned = assignToCategoryMonth(june, groceries, 50000); groceries = applyActivityToCategoryMonth(assigned.categoryMonth, -15000); console.log(rolloverBudgetMonth(assigned.budgetMonth, [groceries], "2026-07"));
