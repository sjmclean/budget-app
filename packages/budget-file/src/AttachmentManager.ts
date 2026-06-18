import { randomUUID } from "node:crypto";
import { copyFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import {
  assertSafePackageFileName,
  resolveInsidePackage,
} from "./pathSafety.js";
import type { AttachmentRecord, StorageStats } from "./BudgetPackageTypes.js";
import {
  directorySize,
  ensureDir,
  extensionFor,
  sha256File,
} from "./fsHelpers.js";

export class AttachmentManager {
  addAttachment(packagePath: string, sourceFilePath: string): AttachmentRecord {
    const id = randomUUID();
    const storedFileName = `${id}${extensionFor(sourceFilePath)}`;
    const relativePath = `Attachments/${storedFileName}`;
    const destinationDir = join(packagePath, "Attachments");
    ensureDir(destinationDir);
    const destination = resolveInsidePackage(packagePath, relativePath);
    copyFileSync(sourceFilePath, destination);

    return {
      id,
      originalFileName: basename(sourceFilePath),
      storedFileName,
      relativePath,
      sizeBytes: statSync(destination).size,
      sha256: sha256File(destination),
      addedAt: new Date().toISOString(),
    };
  }

  getAttachmentPath(packagePath: string, storedFileName: string): string {
    assertSafePackageFileName(storedFileName);
    return join(packagePath, "Attachments", storedFileName);
  }

  getStorageStats(packagePath: string): StorageStats {
    const databaseBytes = directorySize(join(packagePath, "budget.db"));
    const attachmentBytes = directorySize(join(packagePath, "Attachments"));
    const backupBytes = directorySize(join(packagePath, "Backups"));
    return {
      databaseBytes,
      attachmentBytes,
      backupBytes,
      totalBytes: databaseBytes + attachmentBytes + backupBytes,
    };
  }
}
