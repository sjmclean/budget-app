import { SyncProvider } from "./SyncProvider.js";

export enum SyncMode {
  Manual = "Manual",
  OnAppStart = "OnAppStart",
  OnAppClose = "OnAppClose",
  Interval = "Interval",
}

export enum ConflictPolicy {
  AskUser = "AskUser",
  KeepLocal = "KeepLocal",
  KeepRemote = "KeepRemote",
  CreateConflictCopy = "CreateConflictCopy",
}

export interface CloudStorageSettings {
  id: string;
  userId: string;
  deviceId: string | null;
  provider: SyncProvider;
  enabled: boolean;
  syncRootPath: string;
  budgetFolderPath: string;
  backupFolderPath: string;
  attachmentFolderPath: string;
  lastSyncAt: Date | null;
  syncMode: SyncMode;
  conflictPolicy: ConflictPolicy;
  intervalMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
}
