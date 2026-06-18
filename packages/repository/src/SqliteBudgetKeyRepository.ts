import { eq } from "drizzle-orm";
import { budgetKeys } from "../../database/src/schema.js";
import { BudgetKey } from "../../types/src/BudgetKey.js";
import { BudgetKeyRepository } from "./BudgetKeyRepository.js";

export class SqliteBudgetKeyRepository implements BudgetKeyRepository {
  constructor(private db: any) {}

  async create(budgetKey: BudgetKey): Promise<void> {
    await this.db.insert(budgetKeys).values(budgetKey);
  }

  async findByBudget(budgetId: string): Promise<BudgetKey[]> {
    return await this.db.select().from(budgetKeys).where(eq(budgetKeys.budgetId, budgetId));
  }
}
