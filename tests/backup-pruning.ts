import { createBackupVersion } from "../packages/budget-engine/src/services/createBackupVersion.js";
import { pruneAutomaticBackupVersions } from "../packages/budget-engine/src/services/pruneBackupVersions.js";
import { BackupType } from "../packages/types/src/BackupType.js";

const backups = [];

for (let i = 1; i <= 12; i++) {
  backups.push(createBackupVersion({
    budgetId: "budget",
    userId: "user",
    versionNumber: i,
    type: BackupType.Automatic,
    filePath: `auto-${i}.budget`,
    fileSize: 1000 + i
  }));
}

backups.push(createBackupVersion({
  budgetId: "budget",
  userId: "user",
  versionNumber: 13,
  type: BackupType.Manual,
  filePath: "manual.budget",
  fileSize: 9999
}));

const result = pruneAutomaticBackupVersions(backups, 10);

console.log("keep", result.keep.length);
console.log("remove", result.remove.length);
console.log("manual kept", result.keep.some((backup) => backup.type === BackupType.Manual));
