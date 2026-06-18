export interface BudgetKey {
  id: string;
  budgetId: string;
  keyVersion: number;
  encryptedKey: string;
  createdAt: Date;
}
