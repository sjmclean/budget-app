import { eq } from "drizzle-orm";
import { budgetSettings } from "../../database/src/schema.js";
import { BudgetSettings } from "../../types/src/BudgetSettings.js";
import { BudgetSettingsRepository } from "./BudgetSettingsRepository.js";

export class SqliteBudgetSettingsRepository implements BudgetSettingsRepository {
  constructor(private db: any) {}

  async create(item: BudgetSettings): Promise<void> {
    await this.db.insert(budgetSettings).values(item);
  }

  async update(item: BudgetSettings): Promise<void> {
    await this.db
      .update(budgetSettings)
      .set(item)
      .where(eq(budgetSettings.id, item.id));
  }

  async findByBudgetId(budgetId: string): Promise<BudgetSettings[]> {
    return await this.db
      .select()
      .from(budgetSettings)
      .where(eq(budgetSettings.budgetId, budgetId));
  }
}
