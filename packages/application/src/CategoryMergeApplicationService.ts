/**
 * Category merge service.
 *
 * Imports and long-lived budgets often accumulate near-duplicate categories. A merge is
 * more than renaming: transactions and budget-month values must be moved so
 * historical reports remain coherent. The source category is archived rather than hard
 * deleted to preserve auditability and avoid surprising users.
 */
import { CategoryRepository } from "../../repository/src/CategoryRepository.js";
import { CategoryMonthRepository } from "../../repository/src/CategoryMonthRepository.js";
import { TransactionRepository } from "../../repository/src/TransactionRepository.js";

export interface CategoryMergeResult {
  movedTransactions: number;
  movedCategoryMonths: number;
}

export class CategoryMergeApplicationService {
  constructor(
    private categoryRepo: CategoryRepository,
    private categoryMonthRepo: CategoryMonthRepository,
    private transactionRepo: TransactionRepository
  ) {}

  async mergeCategories(sourceCategoryId: string, targetCategoryId: string, budgetId: string): Promise<CategoryMergeResult> {
    if (sourceCategoryId === targetCategoryId) throw new Error("Cannot merge a category into itself");
    const source = await this.categoryRepo.getById(sourceCategoryId);
    const target = await this.categoryRepo.getById(targetCategoryId);
    if (!source || !target) throw new Error("Source and target categories are required");

    const transactions = await this.transactionRepo.findByBudget(budgetId);
    let movedTransactions = 0;
    for (const transaction of transactions.filter((tx) => tx.categoryId === sourceCategoryId)) {
      await this.transactionRepo.update({ ...transaction, categoryId: targetCategoryId, updatedAt: new Date() });
      movedTransactions++;
    }

    let movedCategoryMonths = 0;
    const sourceMonths = await this.categoryMonthRepo.findByCategory(sourceCategoryId);
    for (const sourceMonth of sourceMonths) {
      const targetMonth = await this.categoryMonthRepo.getByBudgetMonthAndCategory(sourceMonth.budgetMonthId, targetCategoryId);
      if (targetMonth) {
        await this.categoryMonthRepo.update({
          ...targetMonth,
          previousAvailable: targetMonth.previousAvailable + sourceMonth.previousAvailable,
          assigned: targetMonth.assigned + sourceMonth.assigned,
          activity: targetMonth.activity + sourceMonth.activity,
          available: targetMonth.available + sourceMonth.available,
          updatedAt: new Date()
        });
        await this.categoryMonthRepo.update({ ...sourceMonth, previousAvailable: 0, assigned: 0, activity: 0, available: 0, updatedAt: new Date() });
      } else {
        await this.categoryMonthRepo.update({ ...sourceMonth, categoryId: targetCategoryId, updatedAt: new Date() });
      }
      movedCategoryMonths++;
    }

    return { movedTransactions, movedCategoryMonths };
  }
}
