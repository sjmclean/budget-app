import { addIncomeToBudgetMonth } from "../packages/budget-engine/src/services/addIncomeToBudgetMonth.js";
import { createBudgetMonth } from "../packages/budget-engine/src/services/createBudgetMonth.js";
import { assertBudgetMonth } from "./support/assertions/budgetAssertions.js";

const empty = createBudgetMonth("budget", "2026-06");
assertBudgetMonth(empty, {
  budgetId: "budget",
  month: "2026-06",
  income: 0,
  assigned: 0,
  activity: 0,
  readyToBudget: 0,
});

const funded = addIncomeToBudgetMonth(empty, 400_000);
assertBudgetMonth(funded, { income: 400_000, assigned: 0, readyToBudget: 400_000 });
assertBudgetMonth(empty, { income: 0, readyToBudget: 0 });
