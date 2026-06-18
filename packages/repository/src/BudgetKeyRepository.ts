import { BudgetKey } from "../../types/src/BudgetKey.js";

export interface BudgetKeyRepository {
  create(budgetKey: BudgetKey): Promise<void>;
  findByBudget(budgetId: string): Promise<BudgetKey[]>;
}
