import { randomUUID } from "crypto";
import { BackupRecord } from "../../../types/src/BackupRecord.js";

export function createBackupRecord(
  budgetId: string,
  userId: string,
  filePath: string,
): BackupRecord {
  return {
    id: randomUUID(),
    budgetId,
    userId,
    filePath,
    createdAt: new Date(),
  };
}
