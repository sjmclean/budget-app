export interface CategoryMonth {
  id: string;
  budgetMonthId: string;
  categoryId: string;
  previousAvailable: number;
  assigned: number;
  activity: number;
  available: number;
  createdAt: Date;
  updatedAt: Date;
}
