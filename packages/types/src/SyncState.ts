export interface SyncState {
  id: string;
  budgetId: string;
  deviceId: string;
  lastSyncedAt: Date | null;
  lastChangeHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}
