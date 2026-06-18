import { GoalType } from "../packages/types/src/GoalType.js";
import { calculateGoalProgress, createBudgetMonth, createCategoryMonth, rolloverBudgetMonth } from "../packages/budget-engine/src/index.js";

const june = createBudgetMonth("budget-1", "2026-06", 100000, 0, 0);
const rent = createCategoryMonth(june.id, "rent", 0, 50000, -50000);
const car = createCategoryMonth(june.id, "car", 0, 20000, 0);
const groceries = createCategoryMonth(june.id, "groceries", 0, 10000, -15000);

const rollover = rolloverBudgetMonth(june, [rent, car, groceries], "2026-07");
const rolledCar = rollover.categoryMonths.find((cm) => cm.categoryId === "car");
const rolledGroceries = rollover.categoryMonths.find((cm) => cm.categoryId === "groceries");

if (!rolledCar || rolledCar.previousAvailable !== 20000) {
  throw new Error("Expected positive available amount to roll forward");
}

if (!rolledGroceries || rolledGroceries.previousAvailable !== 0) {
  throw new Error("Expected overspent category not to carry negative available forward");
}

if (rollover.budgetMonth.readyToBudget !== -5000) {
  throw new Error("Expected cash overspending to reduce next month Ready To Assign");
}

const goal = {
  id: "goal-1",
  budgetId: "budget-1",
  categoryId: "car",
  type: GoalType.TargetDate,
  name: "Car Insurance",
  targetAmount: 120000,
  targetDate: "2026-11-01",
  monthlyAmount: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

const progress = calculateGoalProgress(goal, 30000, "2026-06-01");
if (progress.remainingAmount !== 90000 || progress.suggestedMonthlyContribution !== 15000) {
  throw new Error("Expected target-date goal to calculate remaining amount over remaining months");
}

console.log("v1.2.4 rollover and goals OK");
