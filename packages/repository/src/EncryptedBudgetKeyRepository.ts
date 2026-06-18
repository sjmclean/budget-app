import { EncryptedBudgetKey } from "../../types/src/EncryptedBudgetKey.js";

export interface EncryptedBudgetKeyRepository {
  create(key: EncryptedBudgetKey): Promise<void>;
  getForUserAndBudget(userId: string, budgetId: string): Promise<EncryptedBudgetKey | null>;
}
