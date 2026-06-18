import { BudgetSettings } from "../../types/src/BudgetSettings.js";

export interface BudgetSettingsRepository {
  create(item: BudgetSettings): Promise<void>;
  update?(item: BudgetSettings): Promise<void>;
  findByBudgetId(budgetId: string): Promise<BudgetSettings[]>;
}
