import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  BackupIntegrityManager,
  type BackupIntegrityManifest,
} from "./BackupIntegrityManager.js";
import { RestoreManager } from "./RestoreManager.js";

/**
 * Restore wrapper that validates both the source backup and the destination path before
 * any destructive replacement happens. The plain `RestoreManager` still performs the
 * actual copy so older tests continue to work.
 */
export class SafeRestoreManager {
  constructor(
    private restoreManager = new RestoreManager(),
    private integrity = new BackupIntegrityManager(),
  ) {}

  verifyBackup(
    backupPackagePath: string,
    manifest?: BackupIntegrityManifest,
  ): boolean {
    if (!this.restoreManager.verifyBackup(backupPackagePath)) return false;
    return manifest
      ? this.integrity.verify(backupPackagePath, manifest).ok
      : true;
  }

  restoreBackup(
    backupPackagePath: string,
    targetPackagePath: string,
    manifest?: BackupIntegrityManifest,
  ): void {
    const target = resolve(targetPackagePath);
    if (!target.endsWith(".budget"))
      throw new Error("Restore target must be a .budget package folder");
    if (!existsSync(dirname(target)))
      mkdirSync(dirname(target), { recursive: true });
    if (!this.verifyBackup(backupPackagePath, manifest))
      throw new Error("Backup failed integrity verification");
    this.restoreManager.restoreBackup(backupPackagePath, target);
  }
}
