import { existsSync } from "node:fs";
import { join } from "node:path";
import { BudgetOpener } from "./BudgetOpener.js";
import { copyDirectory, ensureDir, removeIfExists } from "./fsHelpers.js";

export class RestoreManager {
  verifyBackup(backupPackagePath: string): boolean {
    return new BudgetOpener().validate(backupPackagePath).ok;
  }

  restoreBackup(backupPackagePath: string, targetPackagePath: string): void {
    if (!existsSync(backupPackagePath))
      throw new Error(`Backup does not exist: ${backupPackagePath}`);
    if (!this.verifyBackup(backupPackagePath))
      throw new Error("Backup package is invalid");
    removeIfExists(targetPackagePath);
    copyDirectory(backupPackagePath, targetPackagePath, {
      excludeNames: ["budget.lock"],
    });
    ensureDir(join(targetPackagePath, "Backups"));
    ensureDir(join(targetPackagePath, "Temp"));
  }
}
