import { OverspendingDecisionType } from "../packages/types/src/OverspendingDecision.js";
import { createBudgetMonth, createCategoryMonth, applyOverspendingDecision } from "../packages/budget-engine/src/index.js";

const currentMonth = createBudgetMonth("budget-1", "2026-06", 100000, 0, 0);
const nextMonth = createBudgetMonth("budget-1", "2026-07", 0, 0, 0);
const groceries = createCategoryMonth(currentMonth.id, "groceries", 0, 20000, -25000);
const dining = createCategoryMonth(currentMonth.id, "dining", 0, 10000, 0);

const coverResult = applyOverspendingDecision({
  currentBudgetMonth: currentMonth,
  nextBudgetMonth: nextMonth,
  overspentCategoryMonth: groceries,
  coveringCategoryMonth: dining,
  decision: OverspendingDecisionType.Cover
});

const coveredGroceries = coverResult.categoryMonths.find((cm) => cm.categoryId === "groceries");
const coveredDining = coverResult.categoryMonths.find((cm) => cm.categoryId === "dining");

if (!coveredGroceries || coveredGroceries.available !== 0) {
  throw new Error("Expected cover decision to bring overspent category to zero available");
}

if (!coveredDining || coveredDining.available !== 5000) {
  throw new Error("Expected cover decision to reduce covering category available");
}

const leaveResult = applyOverspendingDecision({
  currentBudgetMonth: currentMonth,
  nextBudgetMonth: createBudgetMonth("budget-1", "2026-07", 50000, 0, 0),
  overspentCategoryMonth: groceries,
  decision: OverspendingDecisionType.LeaveOverspent
});

if (leaveResult.nextBudgetMonth.income !== 45000 || leaveResult.nextBudgetMonth.readyToBudget !== 45000) {
  throw new Error("Expected leave-overspent decision to reduce next month Ready To Assign");
}

console.log("v1.2.4 overspending workflow OK");
