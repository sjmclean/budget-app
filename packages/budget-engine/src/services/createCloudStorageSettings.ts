import { randomUUID } from "crypto";
import { CloudStorageSettings, ConflictPolicy, SyncMode } from "../../../types/src/CloudStorageSettings.js";
import { SyncProvider } from "../../../types/src/SyncProvider.js";

export function createCloudStorageSettings(input: {
  userId: string;
  deviceId?: string | null;
  provider?: SyncProvider;
  syncRootPath: string;
  budgetFolderPath?: string;
  backupFolderPath?: string;
  attachmentFolderPath?: string;
}): CloudStorageSettings {
  const now = new Date();

  return {
    id: randomUUID(),
    userId: input.userId,
    deviceId: input.deviceId ?? null,
    provider: input.provider ?? SyncProvider.LocalFolder,
    enabled: true,
    syncRootPath: input.syncRootPath,
    budgetFolderPath: input.budgetFolderPath ?? `${input.syncRootPath}/Budgets`,
    backupFolderPath: input.backupFolderPath ?? `${input.syncRootPath}/Backups`,
    attachmentFolderPath: input.attachmentFolderPath ?? `${input.syncRootPath}/Attachments`,
    lastSyncAt: null,
    syncMode: SyncMode.OnAppClose,
    conflictPolicy: ConflictPolicy.AskUser,
    intervalMinutes: null,
    createdAt: now,
    updatedAt: now
  };
}
