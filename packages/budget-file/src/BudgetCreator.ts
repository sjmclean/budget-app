import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { initDatabase } from "../../database/src/initDatabase.js";
import type {
  BudgetPackageMetadata,
  OpenBudgetPackageResult,
} from "./BudgetPackageTypes.js";
import { writeBudgetMetadata } from "./BudgetMetadata.js";
import { ensureDir } from "./fsHelpers.js";

export interface CreateBudgetPackageInput {
  packagePath: string;
  name: string;
  currency: string;
  ownerUserId?: string;
  appVersion?: string;
  schemaVersion?: number;
  overwrite?: boolean;
}

export class BudgetCreator {
  create(input: CreateBudgetPackageInput): OpenBudgetPackageResult {
    if (existsSync(input.packagePath) && input.overwrite !== true) {
      throw new Error(`Budget package already exists: ${input.packagePath}`);
    }

    ensureDir(input.packagePath);
    ensureDir(join(input.packagePath, "Attachments"));
    ensureDir(join(input.packagePath, "Backups"));
    ensureDir(join(input.packagePath, "Temp"));

    const now = new Date().toISOString();
    const metadata: BudgetPackageMetadata = {
      id: randomUUID(),
      name: input.name || basename(input.packagePath).replace(/\.budget$/i, ""),
      appVersion: input.appVersion ?? "1.2.1",
      schemaVersion: input.schemaVersion ?? 1,
      currency: input.currency,
      createdAt: now,
      updatedAt: now,
      ownerUserId: input.ownerUserId,
    };

    writeBudgetMetadata(input.packagePath, metadata);

    const databasePath = join(input.packagePath, "budget.db");
    const sqlite = new Database(databasePath);
    try {
      initDatabase(sqlite);
    } finally {
      sqlite.close();
    }

    return { packagePath: input.packagePath, databasePath, metadata };
  }
}
