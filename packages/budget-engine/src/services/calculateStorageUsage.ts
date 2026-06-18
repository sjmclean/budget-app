import { BackupVersion } from "../../../types/src/BackupVersion.js";
import { StorageUsage } from "../../../types/src/StorageUsage.js";
import { TransactionAttachment } from "../../../types/src/TransactionAttachment.js";

export function calculateStorageUsage(
  budgetFileSize: number,
  attachments: TransactionAttachment[],
  backups: BackupVersion[],
): StorageUsage {
  const attachmentSize = attachments.reduce(
    (total, item) => total + item.fileSize,
    0,
  );
  const backupSize = backups.reduce((total, item) => total + item.fileSize, 0);

  return {
    budgetFileSize,
    attachmentSize,
    backupSize,
    totalSize: budgetFileSize + attachmentSize + backupSize,
  };
}
