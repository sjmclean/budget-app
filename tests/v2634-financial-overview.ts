import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync(
  new URL("../apps/web/src/pages/DashboardPage.tsx", import.meta.url),
  "utf8",
);
const worker = readFileSync(
  new URL("../apps/web/src/features/persistence/localFirst/localBudget.worker.ts", import.meta.url),
  "utf8",
);

assert.match(dashboard, /getFinancialOverview\(/);
assert.match(dashboard, /capabilities\.analytics/);
assert.doesNotMatch(dashboard, /buildFinancialOverviewSummary/);
assert.doesNotMatch(dashboard, /getAccountRegisterView/);
assert.doesNotMatch(dashboard, /listAccounts\(/);

const overviewStart = worker.indexOf("function getFinancialOverview(");
const overviewEnd = worker.indexOf("function getMonthlySpending(", overviewStart);
assert.ok(overviewStart >= 0 && overviewEnd > overviewStart);
const overview = worker.slice(overviewStart, overviewEnd);
assert.match(overview, /readBudgetMonth\(month\)/);
assert.match(overview, /readyToAssign: budgetView\.readyToAssign/);
assert.match(overview, /substr\(date, 1, 7\) = \?/);
assert.doesNotMatch(overview, /getAccountRegisterView/);

console.log("v2.63.4 authoritative SQLite financial overview validation passed");
