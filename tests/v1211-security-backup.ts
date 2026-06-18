import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BackupIntegrityManager,
  BudgetPackageManager,
  SafeRestoreManager,
} from "../packages/budget-file/src/index.js";
import {
  derivePasswordSecret,
  verifyPasswordSecret,
} from "../packages/security/src/index.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const root = mkdtempSync(join(tmpdir(), "v1211-security-"));
const manager = new BudgetPackageManager();
const packagePath = join(root, "Household.budget");
manager.create({ packagePath, name: "Household", currency: "AUD" });

const attachmentSource = join(root, "receipt.txt");
writeFileSync(attachmentSource, "receipt contents");
const attachment = manager.attachments.addAttachment(
  packagePath,
  attachmentSource,
);
assert(
  existsSync(
    manager.attachments.getAttachmentPath(
      packagePath,
      attachment.storedFileName,
    ),
  ),
  "Expected safe attachment path to resolve",
);

let unsafeRejected = false;
try {
  manager.attachments.getAttachmentPath(packagePath, "../../escape.txt");
} catch {
  unsafeRejected = true;
}
assert(unsafeRejected, "Expected unsafe attachment file name to be rejected");

const backup = manager.backups.createBackup(packagePath, "manual");
const integrity = new BackupIntegrityManager();
const manifest = integrity.createManifest(backup.path);
assert(
  integrity.verify(backup.path, manifest).ok,
  "Expected fresh backup manifest verification to pass",
);

rmSync(join(backup.path, attachment.relativePath));
const corrupt = integrity.verify(backup.path, manifest);
assert(
  !corrupt.ok && corrupt.missingFiles.includes(attachment.relativePath),
  "Expected missing attachment to fail backup verification",
);

const secondBackup = manager.backups.createBackup(packagePath, "manual");
const secondManifest = integrity.createManifest(secondBackup.path);
const restore = new SafeRestoreManager();
const restoredPath = join(root, "Restored.budget");
restore.restoreBackup(secondBackup.path, restoredPath, secondManifest);
assert(
  manager.validate(restoredPath).ok,
  "Expected safely restored package to validate",
);

let invalidTargetRejected = false;
try {
  restore.restoreBackup(
    secondBackup.path,
    join(root, "not-a-budget-folder"),
    secondManifest,
  );
} catch {
  invalidTargetRejected = true;
}
assert(
  invalidTargetRejected,
  "Expected non-.budget restore target to be rejected",
);

const secret = derivePasswordSecret("correct horse battery staple");
assert(
  verifyPasswordSecret("correct horse battery staple", secret),
  "Expected scrypt password verification to pass",
);
assert(
  !verifyPasswordSecret("wrong password", secret),
  "Expected wrong password to fail verification",
);

console.log("PASS: v1.2.11 security and backup hardening");
