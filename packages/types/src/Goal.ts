import { GoalType } from "./GoalType.js";

export interface Goal {
  id: string;
  budgetId: string;
  categoryId: string;
  type: GoalType;
  name: string;
  targetAmount: number;
  targetDate: string | null;
  monthlyAmount: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
