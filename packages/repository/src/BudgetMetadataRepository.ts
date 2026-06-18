import { BudgetMetadata } from "../../types/src/BudgetMetadata.js";

export interface BudgetMetadataRepository {
  create(metadata: BudgetMetadata): Promise<void>;
  update(metadata: BudgetMetadata): Promise<void>;
  getByBudget(budgetId: string): Promise<BudgetMetadata | null>;
}
