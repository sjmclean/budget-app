export interface FileFingerprint {
  id: string;
  budgetId: string;
  filePath: string;
  fileSize: number;
  modifiedAt: number;
  fingerprint: string;
  createdAt: Date;
}
