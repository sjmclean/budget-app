import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { sha256File } from "./fsHelpers.js";
import { BudgetOpener } from "./BudgetOpener.js";

export interface BackupIntegrityFile {
  relativePath: string;
  sizeBytes: number;
  sha256: string;
}

export interface BackupIntegrityManifest {
  packagePath: string;
  createdAt: string;
  files: BackupIntegrityFile[];
}

export interface BackupVerificationReport {
  ok: boolean;
  packageValid: boolean;
  missingFiles: string[];
  changedFiles: string[];
  extraFiles: string[];
}

/**
 * Builds and verifies deterministic file manifests for budget-package backups.
 *
 * Backups are only useful if the app can tell whether they are complete. We hash the
 * core files and attachments so restore can fail before it destroys the current budget.
 * Temp files, lock files, and nested backups are excluded because they are volatile.
 */
export class BackupIntegrityManager {
  createManifest(packagePath: string): BackupIntegrityManifest {
    return {
      packagePath,
      createdAt: new Date().toISOString(),
      files: this.walk(packagePath).sort((a, b) =>
        a.relativePath.localeCompare(b.relativePath),
      ),
    };
  }

  verify(
    packagePath: string,
    manifest: BackupIntegrityManifest,
  ): BackupVerificationReport {
    const current = new Map(
      this.walk(packagePath).map((file) => [file.relativePath, file]),
    );
    const expected = new Map(
      manifest.files.map((file) => [file.relativePath, file]),
    );
    const missingFiles: string[] = [];
    const changedFiles: string[] = [];
    const extraFiles: string[] = [];

    for (const file of manifest.files) {
      const actual = current.get(file.relativePath);
      if (!actual) missingFiles.push(file.relativePath);
      else if (
        actual.sizeBytes !== file.sizeBytes ||
        actual.sha256 !== file.sha256
      )
        changedFiles.push(file.relativePath);
    }

    for (const file of current.values()) {
      if (!expected.has(file.relativePath)) extraFiles.push(file.relativePath);
    }

    const packageValid = new BudgetOpener().validate(packagePath).ok;
    return {
      ok:
        packageValid && missingFiles.length === 0 && changedFiles.length === 0,
      packageValid,
      missingFiles,
      changedFiles,
      extraFiles,
    };
  }

  private walk(root: string, dir = root): BackupIntegrityFile[] {
    if (!existsSync(dir)) return [];
    const files: BackupIntegrityFile[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (
        ["Backups", "Temp"].includes(entry.name) ||
        entry.name === "budget.lock"
      )
        continue;
      const absolutePath = join(dir, entry.name);
      const relativePath = absolutePath
        .slice(root.length + 1)
        .replace(/\\/g, "/");
      if (entry.isDirectory()) files.push(...this.walk(root, absolutePath));
      else
        files.push({
          relativePath,
          sizeBytes: statSync(absolutePath).size,
          sha256: sha256File(absolutePath),
        });
    }
    return files;
  }
}
