import { BackupType } from "../../../types/src/BackupType.js";
import { BackupVersion } from "../../../types/src/BackupVersion.js";

export interface BackupPruneResult {
  keep: BackupVersion[];
  remove: BackupVersion[];
}

export function pruneAutomaticBackupVersions(
  backups: BackupVersion[],
  maxAutomaticBackups = 10
): BackupPruneResult {
  const automatic = backups
    .filter((backup) => backup.type === BackupType.Automatic)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const manualAndSpecial = backups.filter((backup) => backup.type !== BackupType.Automatic);

  const keepAutomatic = automatic.slice(0, maxAutomaticBackups);
  const remove = automatic.slice(maxAutomaticBackups);

  return {
    keep: [...manualAndSpecial, ...keepAutomatic].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    ),
    remove
  };
}
