import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { BackupInfo } from "./BudgetPackageTypes.js";
import { copyDirectory, ensureDir, safeTimestamp } from "./fsHelpers.js";

export class BackupManager {
  createBackup(packagePath: string, type: "manual" | "auto" = "manual", date = new Date()): BackupInfo {
    const backupRoot = join(packagePath, "Backups");
    ensureDir(backupRoot);
    const name = `${basename(packagePath).replace(/\.budget$/i, "")}-${safeTimestamp(date)}-${type}.budget`;
    const destination = join(backupRoot, name);
    copyDirectory(packagePath, destination, { excludeNames: ["Backups", "Temp", "budget.lock"] });
    ensureDir(join(destination, "Backups"));
    ensureDir(join(destination, "Temp"));
    return { name, path: destination, createdAt: date.toISOString(), type };
  }

  listBackups(packagePath: string): BackupInfo[] {
    const backupRoot = join(packagePath, "Backups");
    if (!existsSync(backupRoot)) return [];
    return readdirSync(backupRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.endsWith(".budget"))
      .map((entry) => {
        const type = entry.name.includes("-auto.budget") ? "auto" : "manual";
        const path = join(backupRoot, entry.name);
        return { name: entry.name, path, createdAt: statSync(path).mtime.toISOString(), type } as BackupInfo;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  pruneBackups(packagePath: string, keepLatest = 10): number {
    const backups = this.listBackups(packagePath);
    const toDelete = backups.slice(0, Math.max(0, backups.length - keepLatest));
    for (const backup of toDelete) rmSync(backup.path, { recursive: true, force: true });
    return toDelete.length;
  }
}
