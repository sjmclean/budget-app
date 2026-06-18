import { randomUUID } from "crypto";
import { Goal } from "../../../types/src/Goal.js";
import { GoalType } from "../../../types/src/GoalType.js";

export interface CreateGoalInput {
  budgetId: string;
  categoryId: string;
  type: GoalType;
  name: string;
  targetAmount: number;
  targetDate?: string | null;
  monthlyAmount?: number | null;
}

export function createGoal(input: CreateGoalInput): Goal {
  const now = new Date();

  return {
    id: randomUUID(),
    budgetId: input.budgetId,
    categoryId: input.categoryId,
    type: input.type,
    name: input.name,
    targetAmount: input.targetAmount,
    targetDate: input.targetDate ?? null,
    monthlyAmount: input.monthlyAmount ?? null,
    isActive: true,
    createdAt: now,
    updatedAt: now
  };
}
