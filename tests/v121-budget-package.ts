import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BudgetPackageManager } from "../packages/budget-file/src/index.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const root = mkdtempSync(join(tmpdir(), "budget-package-"));
const packagePath = join(root, "Household Budget.budget");
const manager = new BudgetPackageManager();

const created = manager.create({
  packagePath,
  name: "Household Budget",
  currency: "AUD",
  ownerUserId: "local-user",
});

assert(existsSync(packagePath), "Expected .budget package folder to exist");
assert(existsSync(join(packagePath, "budget.db")), "Expected budget.db to exist");
assert(existsSync(join(packagePath, "budget.json")), "Expected budget.json to exist");
assert(existsSync(join(packagePath, "Attachments")), "Expected Attachments folder to exist");
assert(existsSync(join(packagePath, "Backups")), "Expected Backups folder to exist");
assert(existsSync(join(packagePath, "Temp")), "Expected Temp folder to exist");
assert(created.metadata.currency === "AUD", "Expected AUD currency metadata");

const validation = manager.validate(packagePath);
assert(validation.ok, `Expected package validation to pass: ${validation.issues.join(", ")}`);

const opened = manager.open(packagePath);
assert(opened.metadata.name === "Household Budget", "Expected package opener to read metadata");
assert(opened.databasePath.endsWith("budget.db"), "Expected opener to return database path");

const metadata = JSON.parse(readFileSync(join(packagePath, "budget.json"), "utf8"));
assert(metadata.appVersion === "1.2.1", "Expected package appVersion 1.2.1");

console.log("PASS: v1.2.1 budget package create/open/validate");
