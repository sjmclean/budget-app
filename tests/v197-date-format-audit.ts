import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const sourceRoots = ["apps/web/src"];
const ignoredDirectories = new Set(["node_modules", ".git", "dist", "build"]);
const sourceFileExtensions = new Set([".ts", ".tsx"]);

const allowedDateTimeFormatFiles = new Set([
  // Shared formatter: this is the only approved user-facing calendar date formatter.
  "apps/web/src/features/settings/dateFormatting.ts",
  // Budget/reporting month labels are period labels such as "June 2026", not calendar dates.
  "apps/web/src/features/budget/budgetLifecycle.ts",
  "apps/web/src/features/budget/budgetViewService.ts",
  "apps/web/src/features/budget/ynab4LauncherImport.ts",
]);

function listSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];

  for (const entry of entries) {
    if (ignoredDirectories.has(entry)) {
      continue;
    }

    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      files.push(...listSourceFiles(path));
      continue;
    }

    if (sourceFileExtensions.has(extname(path))) {
      files.push(path);
    }
  }

  return files;
}

const sourceFiles = sourceRoots.flatMap(listSourceFiles);

const hardcodedDateFormatterViolations: string[] = [];
const localeDateStringViolations: string[] = [];

for (const file of sourceFiles) {
  const relativePath = relative(process.cwd(), file);
  const content = readFileSync(file, "utf8");

  if (content.includes("toLocaleDateString")) {
    localeDateStringViolations.push(relativePath);
  }

  if (content.includes("Intl.DateTimeFormat") && !allowedDateTimeFormatFiles.has(relativePath)) {
    hardcodedDateFormatterViolations.push(relativePath);
  }
}

assert.deepEqual(localeDateStringViolations, [], "User-facing code should not use toLocaleDateString directly.");
assert.deepEqual(
  hardcodedDateFormatterViolations,
  [],
  "User-facing calendar dates should use the shared date formatting service. Period month labels are explicitly allow-listed.",
);

const accountRegisterPage = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
assert.match(
  accountRegisterPage,
  /function formatPayeeLastUsed\(value: string \| undefined, dateFormat: ReturnType<typeof useDateFormatPreference>\)/,
  "Payee last-used display dates should receive the active date format preference.",
);
assert.doesNotMatch(
  accountRegisterPage,
  /formatDateForDisplay\(value\.slice\(0, 10\)\)/,
  "Payee last-used display dates must not rely on the formatter default.",
);

console.log("v1.97 date format audit checks passed");
