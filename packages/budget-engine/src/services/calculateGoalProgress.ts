import { Goal } from "../../../types/src/Goal.js";
import { GoalProgress } from "../../../types/src/GoalProgress.js";
import { GoalType } from "../../../types/src/GoalType.js";

function monthsUntil(targetDate: string | null, fromDate: string): number {
  if (!targetDate) return 0;

  const from = new Date(`${fromDate}T00:00:00`);
  const target = new Date(`${targetDate}T00:00:00`);

  const months =
    (target.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (target.getUTCMonth() - from.getUTCMonth());

  return Math.max(1, months + 1);
}

export function calculateGoalProgress(
  goal: Goal,
  currentAmount: number,
  fromDate = new Date().toISOString().slice(0, 10),
): GoalProgress {
  const remainingAmount = Math.max(0, goal.targetAmount - currentAmount);
  const percentComplete =
    goal.targetAmount <= 0
      ? 100
      : Math.min(100, Math.round((currentAmount / goal.targetAmount) * 100));

  let suggestedMonthlyContribution = 0;

  if (goal.type === GoalType.MonthlyFunding) {
    suggestedMonthlyContribution = goal.monthlyAmount ?? 0;
  } else if (goal.type === GoalType.TargetDate) {
    suggestedMonthlyContribution = Math.ceil(
      remainingAmount / monthsUntil(goal.targetDate, fromDate),
    );
  } else if (goal.type === GoalType.TargetBalance) {
    suggestedMonthlyContribution = remainingAmount;
  } else if (goal.type === GoalType.DebtPayoff) {
    suggestedMonthlyContribution = goal.monthlyAmount ?? remainingAmount;
  }

  return {
    goalId: goal.id,
    targetAmount: goal.targetAmount,
    currentAmount,
    remainingAmount,
    percentComplete,
    suggestedMonthlyContribution,
  };
}
