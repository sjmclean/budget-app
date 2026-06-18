export interface BudgetSettings {
  id: string;
  budgetId: string;
  currency: string;
  currencySymbol: string;
  decimalPlaces: number;
  monthFormat: string;
  startMonth: string | null;
  maxFutureMonths: number;
  backupLimit: number;
  autoBackupOnClose: boolean;
  autoBackupBeforeImport: boolean;
  autoBackupBeforeRestore: boolean;
  autoBackupBeforeMigration: boolean;
  attachmentFolderName: string;
  cloudStorageSettingId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
