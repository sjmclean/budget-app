import { CategoryMonth } from "../../types/src/CategoryMonth.js";

export interface CategoryMonthRepository {
  create(categoryMonth: CategoryMonth): Promise<void>;
  update(categoryMonth: CategoryMonth): Promise<void>;
  getById(id: string): Promise<CategoryMonth | null>;
  findByBudgetMonth(budgetMonthId: string): Promise<CategoryMonth[]>;
  getByBudgetMonthAndCategory(budgetMonthId: string, categoryId: string): Promise<CategoryMonth | null>;
  findByCategory(categoryId: string): Promise<CategoryMonth[]>;
}
