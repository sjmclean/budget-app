import { FileFingerprint } from "../../types/src/FileFingerprint.js";
import { SyncConflict, SyncConflictType } from "../../types/src/SyncConflict.js";

export function detectSyncConflict(
  local: FileFingerprint,
  remote: FileFingerprint
): SyncConflict | null {
  if (local.fingerprint === remote.fingerprint) {
    return null;
  }

  if (local.modifiedAt !== remote.modifiedAt || local.fileSize !== remote.fileSize) {
    return {
      type: SyncConflictType.FileChangedExternally,
      message: "The budget file appears to have changed outside this app.",
      localFingerprint: local.fingerprint,
      remoteFingerprint: remote.fingerprint
    };
  }

  return {
    type: SyncConflictType.Unknown,
    message: "The budget file fingerprint differs for an unknown reason.",
    localFingerprint: local.fingerprint,
    remoteFingerprint: remote.fingerprint
  };
}
