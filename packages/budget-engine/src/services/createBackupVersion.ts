import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { BackupType } from "../../../types/src/BackupType.js";
import { BackupVersion } from "../../../types/src/BackupVersion.js";

export interface CreateBackupVersionInput {
  budgetId: string;
  userId: string;
  versionNumber: number;
  type: BackupType;
  filePath: string;
  fileSize: number;
  note?: string | null;
  appVersion?: string;
  schemaVersion?: number;
}

export function calculateBackupFingerprint(
  filePath: string,
  fileSize: number,
  versionNumber: number
): string {
  return createHash("sha256")
    .update(`${filePath}:${fileSize}:${versionNumber}`)
    .digest("hex");
}

export function createBackupVersion(input: CreateBackupVersionInput): BackupVersion {
  return {
    id: randomUUID(),
    budgetId: input.budgetId,
    userId: input.userId,
    versionNumber: input.versionNumber,
    type: input.type,
    filePath: input.filePath,
    fileSize: input.fileSize,
    fingerprint: calculateBackupFingerprint(
      input.filePath,
      input.fileSize,
      input.versionNumber
    ),
    note: input.note ?? null,
    appVersion: input.appVersion ?? "0.8.0",
    schemaVersion: input.schemaVersion ?? 1,
    createdAt: new Date()
  };
}
