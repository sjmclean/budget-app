export interface EncryptedBudgetKey {
  id: string;
  budgetId: string;
  userId: string;
  budgetKeyId: string;
  encryptedBudgetKey: string;
  createdAt: Date;
}
