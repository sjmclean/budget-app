export interface BudgetPackageMetadata {
  id: string;
  name: string;
  appVersion: string;
  schemaVersion: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  ownerUserId?: string;
}

export interface OpenBudgetPackageResult {
  packagePath: string;
  databasePath: string;
  metadata: BudgetPackageMetadata;
}

export interface BudgetPackageLock {
  deviceId: string;
  openedAt: string;
  appVersion: string;
}

export interface AttachmentRecord {
  id: string;
  originalFileName: string;
  storedFileName: string;
  relativePath: string;
  sizeBytes: number;
  sha256: string;
  addedAt: string;
}

export interface BudgetPackageValidationResult {
  ok: boolean;
  issues: string[];
}

export interface BackupInfo {
  name: string;
  path: string;
  createdAt: string;
  type: "manual" | "auto";
}

export interface StorageStats {
  databaseBytes: number;
  attachmentBytes: number;
  backupBytes: number;
  totalBytes: number;
}
