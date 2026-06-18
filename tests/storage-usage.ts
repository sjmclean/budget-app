import { calculateStorageUsage } from "../packages/budget-engine/src/services/calculateStorageUsage.js";
import { createBackupVersion } from "../packages/budget-engine/src/services/createBackupVersion.js";
import { createTransactionAttachment } from "../packages/budget-engine/src/services/createTransactionAttachment.js";
import { BackupType } from "../packages/types/src/BackupType.js";

const backup = createBackupVersion({
  budgetId: "budget",
  userId: "user",
  versionNumber: 1,
  type: BackupType.Automatic,
  filePath: "backup.budget",
  fileSize: 5000
});

const attachment = createTransactionAttachment({
  budgetId: "budget",
  transactionId: "transaction",
  originalFileName: "receipt.txt",
  mimeType: "text/plain",
  fileSize: Buffer.byteLength("hello"),
  relativePath: "Budget.attachments",
  content: "hello"
});

console.log(calculateStorageUsage(1000, [attachment], [backup]));
