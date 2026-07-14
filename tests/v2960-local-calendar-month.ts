import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getCurrentBudgetMonth,
  getNextBudgetMonth,
  getPreviousBudgetMonth,
} from "../apps/web/src/features/budget/budgetMonthNavigation.ts";

assert.equal(getCurrentBudgetMonth(new Date(2026, 0, 1, 0, 5)), "2026-01");
assert.equal(getCurrentBudgetMonth(new Date(2026, 6, 1, 0, 5)), "2026-07");
assert.equal(getCurrentBudgetMonth(new Date(2026, 11, 31, 23, 59)), "2026-12");
assert.equal(getNextBudgetMonth("2026-12"), "2027-01");
assert.equal(getPreviousBudgetMonth("2026-01"), "2025-12");

const auditedFiles = [
  "apps/web/src/pages/DashboardPage.tsx",
  "apps/web/src/pages/reports/hooks/useReportsViewModel.ts",
  "apps/web/src/pages/reports/reports/BudgetVsActualReport.tsx",
  "apps/web/src/pages/reports/reports/SpendingByCategoryReport.tsx",
  "apps/web/src/features/budget/budgetLifecycle.ts",
  "apps/web/src/features/budget/newBudget/createBudgetFromSetup.ts",
  "apps/web/src/features/budget/actualBudgetLauncherImport.ts",
  "apps/web/src/features/budget/ynab4LauncherImport.ts",
];

for (const file of auditedFiles) {
  const source = readFileSync(file, "utf8");
  assert.equal(
    source.includes("toISOString().slice(0, 7)"),
    false,
    `${file} must not derive budget months from UTC`,
  );
}

const dashboardSource = readFileSync("apps/web/src/pages/DashboardPage.tsx", "utf8");
assert.match(dashboardSource, /useState\(\(\) =>\s*getCurrentBudgetMonth\(\)/);
assert.match(dashboardSource, /visibilitychange/);
assert.match(dashboardSource, /window\.addEventListener\("focus"/);

const reportsSource = readFileSync(
  "apps/web/src/pages/reports/hooks/useReportsViewModel.ts",
  "utf8",
);
assert.match(reportsSource, /useState\(\(\) => getCurrentReportMonth\(\)\)/);
assert.doesNotMatch(reportsSource, /const currentReportMonth/);

console.log("v2.96.0 local calendar month regression checks passed");
