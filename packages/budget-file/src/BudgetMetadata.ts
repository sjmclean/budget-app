import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BudgetPackageMetadata } from "./BudgetPackageTypes.js";

export const BUDGET_METADATA_FILE = "budget.json";

export function metadataPath(packagePath: string): string {
  return join(packagePath, BUDGET_METADATA_FILE);
}

export function readBudgetMetadata(packagePath: string): BudgetPackageMetadata {
  return JSON.parse(readFileSync(metadataPath(packagePath), "utf8")) as BudgetPackageMetadata;
}

export function writeBudgetMetadata(packagePath: string, metadata: BudgetPackageMetadata): void {
  writeFileSync(metadataPath(packagePath), JSON.stringify(metadata, null, 2));
}

export function touchBudgetMetadata(packagePath: string): BudgetPackageMetadata {
  const metadata = readBudgetMetadata(packagePath);
  const next = { ...metadata, updatedAt: new Date().toISOString() };
  writeBudgetMetadata(packagePath, next);
  return next;
}
