import { createBudgetMonth } from "../packages/budget-engine/src/services/createBudgetMonth.js";
import { addIncomeToBudgetMonth } from "../packages/budget-engine/src/services/addIncomeToBudgetMonth.js";
let month = createBudgetMonth("budget", "2026-06"); month = addIncomeToBudgetMonth(month, 400000); console.log(month);
