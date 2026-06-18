import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BudgetPackageManager } from "../packages/budget-file/src/index.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const root = mkdtempSync(join(tmpdir(), "budget-backup-"));
const packagePath = join(root, "Household.budget");
const restoredPath = join(root, "Restored.budget");
const manager = new BudgetPackageManager();
manager.create({ packagePath, name: "Household", currency: "AUD" });

const source = join(root, "receipt.txt");
writeFileSync(source, "Receipt for backup");
const attachment = manager.attachments.addAttachment(packagePath, source);

const backup = manager.backups.createBackup(packagePath, "manual", new Date("2026-06-17T10:00:00Z"));
assert(existsSync(backup.path), "Expected backup package to exist");
assert(manager.restore.verifyBackup(backup.path), "Expected backup verification to pass");
assert(existsSync(join(backup.path, attachment.relativePath)), "Expected backup to include attachments");

manager.restore.restoreBackup(backup.path, restoredPath);
assert(manager.validate(restoredPath).ok, "Expected restored package to validate");
assert(existsSync(join(restoredPath, attachment.relativePath)), "Expected restored package to include attachment");

for (let i = 0; i < 12; i += 1) {
  manager.backups.createBackup(packagePath, "auto", new Date(Date.UTC(2026, 5, 17, 11, i, 0)));
}
const deleted = manager.backups.pruneBackups(packagePath, 10);
assert(deleted >= 3, "Expected backup pruning to delete old backups");
assert(manager.backups.listBackups(packagePath).length === 10, "Expected latest 10 backups to remain");

console.log("PASS: v1.2.1 backup, restore, and pruning");
