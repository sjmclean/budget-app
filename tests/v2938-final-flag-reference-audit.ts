import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const ignoredDirectoryNames = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

const approvedCompatibilityFiles = new Set([
  "apps/web/src/features/accounts/accountRegisterService.ts",
  "apps/web/src/features/accounts/registerColumns.ts",
  "apps/web/src/features/budget/ynab4LauncherImport.ts",
  "packages/database/src/initDatabase.ts",
  "packages/database/src/schema.ts",
  "packages/types/src/Ynab4Import.ts",
  "packages/ynab4-importer/src/analyzeYnab4Package.ts",
  "packages/ynab4-importer/src/mapYnab4Rows.ts",
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return ignoredDirectoryNames.has(entry) ? [] : sourceFiles(path);
    }
    return /\.(?:ts|tsx)$/.test(entry) ? [path] : [];
  });
}

const forbiddenLiveFlagPattern =
  /TransactionFlag|RegisterTransactionFlag|InlineFlagPicker|FlagDot|setFlag\s*\(|clearFlag\s*\(|getFlags\s*\(|updateTransactionFlag|onUpdateTransactionFlag|flagColour/;

for (const file of [
  ...sourceFiles(join(root, "apps")),
  ...sourceFiles(join(root, "packages")),
]) {
  const repositoryPath = relative(root, file).replaceAll("\\", "/");
  if (approvedCompatibilityFiles.has(repositoryPath)) {
    continue;
  }

  assert.doesNotMatch(
    readFileSync(file, "utf8"),
    forbiddenLiveFlagPattern,
    `${repositoryPath} should not contain live transaction flag functionality`,
  );
}

const completeness = readFileSync(
  join(root, "packages/ynab4-importer/src/assessYnab4ImportCompleteness.ts"),
  "utf8",
);
assert.match(completeness, /converted into reusable transaction tags/);
assert.match(completeness, /status: "supported"/);
assert.doesNotMatch(completeness, /Map YNAB4 flags into TransactionFlag/);

const schemaDocs = readFileSync(join(root, "docs/v1215-database-schema.md"), "utf8");
assert.match(schemaDocs, /Legacy compatibility table retained temporarily/);

console.log("v2.93.8 final flag reference audit checks passed");
