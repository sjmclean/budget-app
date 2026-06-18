import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { BudgetPackageValidationResult, OpenBudgetPackageResult } from "./BudgetPackageTypes.js";
import { readBudgetMetadata } from "./BudgetMetadata.js";

export class BudgetOpener {
  validate(packagePath: string): BudgetPackageValidationResult {
    const issues: string[] = [];
    if (!existsSync(packagePath)) {
      return { ok: false, issues: [`Budget package does not exist: ${packagePath}`] };
    }
    if (!statSync(packagePath).isDirectory()) {
      issues.push("Budget package must be a folder-style .budget package");
    }
    for (const required of ["budget.json", "budget.db", "Attachments", "Backups", "Temp"]) {
      if (!existsSync(join(packagePath, required))) issues.push(`Missing ${required}`);
    }
    if (existsSync(join(packagePath, "budget.json"))) {
      try {
        const metadata = readBudgetMetadata(packagePath);
        if (!metadata.id) issues.push("budget.json is missing id");
        if (!metadata.name) issues.push("budget.json is missing name");
        if (!metadata.currency) issues.push("budget.json is missing currency");
      } catch {
        issues.push("budget.json is not valid JSON metadata");
      }
    }
    return { ok: issues.length === 0, issues };
  }

  open(packagePath: string): OpenBudgetPackageResult {
    const validation = this.validate(packagePath);
    if (!validation.ok) {
      throw new Error(`Invalid budget package: ${validation.issues.join("; ")}`);
    }
    return {
      packagePath,
      databasePath: join(packagePath, "budget.db"),
      metadata: readBudgetMetadata(packagePath),
    };
  }
}
