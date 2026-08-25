import { CategoryGoal } from "./CategoryGoal.js";

export type CategoryGoalStatus = "funded" | "underfunded" | "overdue";

export interface CategoryGoalProjection {
  goal: CategoryGoal;
  progressAmount: number;
  remainingAmount: number;
  recommendedAssignment: number | null;
  percentComplete: number;
  status: CategoryGoalStatus;
}
