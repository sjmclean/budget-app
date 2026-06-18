import { BudgetMonth } from "../../types/src/BudgetMonth.js";
import { CategoryMonth } from "../../types/src/CategoryMonth.js";
import { createBudgetMonth } from "../../budget-engine/src/services/createBudgetMonth.js";
import { createCategoryMonth } from "../../budget-engine/src/services/createCategoryMonth.js";
import { addIncomeToBudgetMonth } from "../../budget-engine/src/services/addIncomeToBudgetMonth.js";
import { assignToCategoryMonth } from "../../budget-engine/src/services/assignToCategoryMonth.js";
import { rolloverBudgetMonth } from "../../budget-engine/src/services/rolloverBudgetMonth.js";
import { BudgetMonthRepository } from "../../repository/src/BudgetMonthRepository.js";
import { CategoryMonthRepository } from "../../repository/src/CategoryMonthRepository.js";

export class BudgetApplicationService {
  constructor(
    private budgetMonthRepo: BudgetMonthRepository,
    private categoryMonthRepo: CategoryMonthRepository
  ) {}

  async createMonth(budgetId: string, month: string): Promise<BudgetMonth> {
    const existing = await this.budgetMonthRepo.getByBudgetAndMonth(budgetId, month);
    if (existing) return existing;

    const budgetMonth = createBudgetMonth(budgetId, month);
    await this.budgetMonthRepo.create(budgetMonth);
    return budgetMonth;
  }

  async createCategoryMonth(budgetMonthId: string, categoryId: string): Promise<CategoryMonth> {
    const existing = await this.categoryMonthRepo.getByBudgetMonthAndCategory(budgetMonthId, categoryId);
    if (existing) return existing;

    const categoryMonth = createCategoryMonth(budgetMonthId, categoryId);
    await this.categoryMonthRepo.create(categoryMonth);
    return categoryMonth;
  }

  async postIncomeToReadyToBudget(budgetId: string, month: string, amount: number): Promise<BudgetMonth> {
    const budgetMonth = await this.createMonth(budgetId, month);
    const updated = addIncomeToBudgetMonth(budgetMonth, amount);
    await this.budgetMonthRepo.update(updated);
    return updated;
  }

  async assignMoney(budgetId: string, month: string, categoryId: string, amount: number): Promise<{ budgetMonth: BudgetMonth; categoryMonth: CategoryMonth }> {
    const budgetMonth = await this.createMonth(budgetId, month);
    const categoryMonth = await this.createCategoryMonth(budgetMonth.id, categoryId);

    const result = assignToCategoryMonth(budgetMonth, categoryMonth, amount);

    await this.budgetMonthRepo.update(result.budgetMonth);
    await this.categoryMonthRepo.update(result.categoryMonth);

    return result;
  }

  async rollover(budgetId: string, fromMonth: string, toMonth: string): Promise<{ budgetMonth: BudgetMonth; categoryMonths: CategoryMonth[] }> {
    const previousMonth = await this.budgetMonthRepo.getByBudgetAndMonth(budgetId, fromMonth);
    if (!previousMonth) throw new Error("Previous budget month not found");

    const previousCategoryMonths = await this.categoryMonthRepo.findByBudgetMonth(previousMonth.id);
    const result = rolloverBudgetMonth(previousMonth, previousCategoryMonths, toMonth);

    await this.budgetMonthRepo.create(result.budgetMonth);
    for (const categoryMonth of result.categoryMonths) {
      await this.categoryMonthRepo.create(categoryMonth);
    }

    return result;
  }
}
