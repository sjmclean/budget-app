import { eq } from "drizzle-orm";
import { goals } from "../../database/src/schema.js";
import { Goal } from "../../types/src/Goal.js";
import { GoalRepository } from "./GoalRepository.js";

export class SqliteGoalRepository implements GoalRepository {
  constructor(private db: any) {}

  async create(goal: Goal): Promise<void> {
    await this.db.insert(goals).values(goal);
  }

  async update(goal: Goal): Promise<void> {
    await this.db.update(goals).set(goal).where(eq(goals.id, goal.id));
  }

  async findByBudget(budgetId: string): Promise<Goal[]> {
    return await this.db.select().from(goals).where(eq(goals.budgetId, budgetId));
  }

  async findByCategory(categoryId: string): Promise<Goal[]> {
    return await this.db.select().from(goals).where(eq(goals.categoryId, categoryId));
  }
}
