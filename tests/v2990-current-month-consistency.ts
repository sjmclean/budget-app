import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const hookSource = readFileSync(
  "apps/web/src/features/budget/useCurrentBudgetMonth.ts",
  "utf8",
);
assert.match(hookSource, /getCurrentBudgetMonth\(\)/);
assert.match(hookSource, /visibilitychange/);
assert.match(hookSource, /window\.addEventListener\("focus"/);
assert.match(hookSource, /removeEventListener\("visibilitychange"/);
assert.match(hookSource, /window\.removeEventListener\("focus"/);

const dashboardSource = readFileSync(
  "apps/web/src/pages/DashboardPage.tsx",
  "utf8",
);
assert.match(dashboardSource, /const overviewMonth = useCurrentBudgetMonth\(\)/);
assert.doesNotMatch(dashboardSource, /setOverviewMonth/);

const registerSource = readFileSync(
  "apps/web/src/pages/AccountRegisterPage.tsx",
  "utf8",
);
assert.match(registerSource, /const currentBudgetMonth = useCurrentBudgetMonth\(\)/);
assert.match(registerSource, /month: currentBudgetMonth/);
assert.match(
  registerSource,
  /\[activeBudgetId, categoriesPersistence, currentBudgetMonth\]/,
);
assert.doesNotMatch(registerSource, /ACTIVE_BUDGET_MONTH/);

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listTypeScriptFiles(path);
    }
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

for (const file of listTypeScriptFiles("apps/web/src")) {
  const source = readFileSync(file, "utf8");
  assert.doesNotMatch(
    source,
    /(?:ACTIVE|CURRENT)_BUDGET_MONTH\s*=\s*["']20\d{2}-\d{2}["']/,
    `${file} must not hard-code the active/current budget month`,
  );
}

console.log("v2.99.0 current month consistency regression checks passed");
