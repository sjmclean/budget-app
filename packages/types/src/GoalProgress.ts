export interface GoalProgress {
  goalId: string;
  targetAmount: number;
  currentAmount: number;
  remainingAmount: number;
  percentComplete: number;
  suggestedMonthlyContribution: number;
}
