export interface DeletedItem {
  id: string;
  budgetId: string;
  entityType: string;
  entityId: string;
  deletedByUserId: string | null;
  deletedAt: Date;
  reason: string | null;
}
