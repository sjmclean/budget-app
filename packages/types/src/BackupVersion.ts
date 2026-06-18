import { BackupType } from "./BackupType.js";

export interface BackupVersion {
  id: string;
  budgetId: string;
  userId: string;
  versionNumber: number;
  type: BackupType;
  filePath: string;
  fileSize: number;
  fingerprint: string;
  note: string | null;
  appVersion: string;
  schemaVersion: number;
  createdAt: Date;
}
