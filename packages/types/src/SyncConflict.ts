export enum SyncConflictType {
  FileChangedExternally = "FileChangedExternally",
  DivergentHistory = "DivergentHistory",
  Unknown = "Unknown",
}

export interface SyncConflict {
  type: SyncConflictType;
  message: string;
  localFingerprint: string | null;
  remoteFingerprint: string | null;
}
