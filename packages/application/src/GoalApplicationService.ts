import { Goal } from "../../types/src/Goal.js";
import { GoalProgress } from "../../types/src/GoalProgress.js";
import { createGoal, CreateGoalInput } from "../../budget-engine/src/services/createGoal.js";
import { calculateGoalProgress } from "../../budget-engine/src/services/calculateGoalProgress.js";
import { GoalRepository } from "../../repository/src/GoalRepository.js";

export class GoalApplicationService {
  constructor(private goalRepo: GoalRepository) {}

  async create(input: CreateGoalInput): Promise<Goal> {
    const goal = createGoal(input);
    await this.goalRepo.create(goal);
    return goal;
  }

  async getBudgetGoals(budgetId: string): Promise<Goal[]> {
    return await this.goalRepo.findByBudget(budgetId);
  }

  progress(goal: Goal, currentAmount: number, fromDate?: string): GoalProgress {
    return calculateGoalProgress(goal, currentAmount, fromDate);
  }
}
