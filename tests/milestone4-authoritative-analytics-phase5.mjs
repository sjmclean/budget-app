import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const dashboard = read("apps/web/src/pages/DashboardPage.tsx");
const reports = read("apps/web/src/pages/reports/hooks/useReportsViewModel.ts");
const worker = read("apps/web/src/features/persistence/localFirst/localBudget.worker.ts");

for (const source of [dashboard, reports]) {
  assert.doesNotMatch(source, /getAccountRegisterView/);
  assert.doesNotMatch(source, /listAccounts\(/);
}
assert.match(dashboard, /getFinancialOverview\(/);
assert.doesNotMatch(dashboard, /buildFinancialOverviewSummary/);
assert.match(reports, /getMonthlySpending\(/);
assert.match(reports, /getMonthlyCategoryTransactions\(/);
assert.doesNotMatch(reports, /buildSpendingByCategoryRows/);

const overview = worker.slice(
  worker.indexOf("function getFinancialOverview("),
  worker.indexOf("function getMonthlySpending("),
);
assert.match(overview, /readBudgetMonth\(month\)/);
assert.match(overview, /readyToAssign: budgetView\.readyToAssign/);

const details = worker.slice(
  worker.indexOf("function getMonthlyCategoryTransactions("),
  worker.indexOf("function getCategoryActivityDrilldown("),
);
assert.match(details, /LIMIT 250/);
assert.match(details, /substr\(transaction_row\.date, 1, 7\) = \?/);
assert.match(details, /substr\(parent\.date, 1, 7\) = \?/);

console.log(
  "Milestone 4 Phase 5 passed: Dashboard and Reports use authoritative, bounded SQLite analytics.",
);
