import { BudgetMonth } from "../../types/src/BudgetMonth.js";

export interface BudgetMonthRepository {
  create(month: BudgetMonth): Promise<void>;
  update(month: BudgetMonth): Promise<void>;
  findByBudget(budgetId: string): Promise<BudgetMonth[]>;
  getByBudgetAndMonth(budgetId: string, month: string): Promise<BudgetMonth | null>;
}
