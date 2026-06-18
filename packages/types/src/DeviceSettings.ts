export interface DeviceSettings {
  id: string;
  deviceId: string;
  lastOpenedBudgetId: string | null;
  backupFolder: string | null;
  attachmentFolder: string | null;
  syncFolder: string | null;
  autoLockMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}
