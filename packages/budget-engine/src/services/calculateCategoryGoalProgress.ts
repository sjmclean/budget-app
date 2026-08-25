import { CategoryGoal } from "../../../types/src/CategoryGoal.js";
import { CategoryGoalProjection } from "../../../types/src/CategoryGoalProjection.js";

const MINOR_UNITS_PER_MAJOR_UNIT = 100;
const BUDGET_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

export interface CalculateCategoryGoalProgressInput {
  goal: CategoryGoal;
  selectedMonth: string;
  assigned: number;
  available: number;
}

function toMinorUnits(amount: number, fieldName: string): number {
  if (!Number.isFinite(amount)) {
    throw new Error(`${fieldName} must be a finite amount`);
  }

  const minorUnits = Math.round(amount * MINOR_UNITS_PER_MAJOR_UNIT);
  if (!Number.isSafeInteger(minorUnits)) {
    throw new Error(`${fieldName} must convert to safe integer minor units`);
  }

  return minorUnits;
}

function fromMinorUnits(amount: number): number {
  return amount / MINOR_UNITS_PER_MAJOR_UNIT;
}

export function budgetMonthIndex(month: string): number {
  const match = BUDGET_MONTH_PATTERN.exec(month);
  if (!match) {
    throw new Error(`Invalid budget month: ${month}`);
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error(`Invalid budget month: ${month}`);
  }

  return year * 12 + monthNumber - 1;
}

function validateGoalMonth(goal: CategoryGoal): number | null {
  if (goal.type === "target-balance-by-date") {
    if (goal.targetMonth === null) {
      throw new Error("A target-balance-by-date goal requires a target month");
    }

    return budgetMonthIndex(goal.targetMonth);
  }

  if (goal.targetMonth !== null) {
    throw new Error(`${goal.type} goals cannot have a target month`);
  }

  return null;
}

function percentComplete(progressMinor: number, targetMinor: number): number {
  return Math.min(100, Math.max(0, (progressMinor / targetMinor) * 100));
}

export function calculateCategoryGoalProgress(
  input: CalculateCategoryGoalProgressInput,
): CategoryGoalProjection {
  const { goal } = input;
  const selectedMonthIndex = budgetMonthIndex(input.selectedMonth);
  const targetMonthIndex = validateGoalMonth(goal);
  const targetMinor = toMinorUnits(goal.targetAmount, "Goal target amount");

  if (targetMinor <= 0) {
    throw new Error("Goal target amount must be greater than zero");
  }

  const assignedMinor = toMinorUnits(input.assigned, "Assigned");
  const availableMinor = toMinorUnits(input.available, "Available");

  if (goal.type === "monthly-funding") {
    const progressMinor = Math.max(0, assignedMinor);
    const remainingMinor = Math.max(0, targetMinor - assignedMinor);

    return {
      goal,
      progressAmount: fromMinorUnits(progressMinor),
      remainingAmount: fromMinorUnits(remainingMinor),
      recommendedAssignment: fromMinorUnits(remainingMinor),
      percentComplete: percentComplete(progressMinor, targetMinor),
      status: remainingMinor === 0 ? "funded" : "underfunded",
    };
  }

  const progressMinor = Math.max(0, availableMinor);
  const remainingMinor = Math.max(0, targetMinor - availableMinor);

  if (goal.type === "target-balance") {
    return {
      goal,
      progressAmount: fromMinorUnits(progressMinor),
      remainingAmount: fromMinorUnits(remainingMinor),
      recommendedAssignment: null,
      percentComplete: percentComplete(progressMinor, targetMinor),
      status: remainingMinor === 0 ? "funded" : "underfunded",
    };
  }

  const isOverdue = selectedMonthIndex > targetMonthIndex!;
  const monthsRemaining = Math.max(1, targetMonthIndex! - selectedMonthIndex + 1);
  const recommendedMinor =
    remainingMinor === 0
      ? 0
      : isOverdue
        ? remainingMinor
        : Math.ceil(remainingMinor / monthsRemaining);

  return {
    goal,
    progressAmount: fromMinorUnits(progressMinor),
    remainingAmount: fromMinorUnits(remainingMinor),
    recommendedAssignment: fromMinorUnits(recommendedMinor),
    percentComplete: percentComplete(progressMinor, targetMinor),
    status: remainingMinor === 0 ? "funded" : isOverdue ? "overdue" : "underfunded",
  };
}
