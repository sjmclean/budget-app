export interface BudgetMetadata {
  id: string;
  budgetId: string;
  schemaVersion: number;
  appVersion: string;
  createdAt: Date;
  updatedAt: Date;
  lastOpenedAt: Date | null;
}
