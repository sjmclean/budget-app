import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(
  new URL("../apps/web/src/features/persistence/localFirst/localBudget.worker.ts", import.meta.url),
  "utf8",
);
const schema = readFileSync(
  new URL("../apps/web/src/features/persistence/localFirst/registerSchema.ts", import.meta.url),
  "utf8",
);
const runtime = readFileSync(
  new URL("../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts", import.meta.url),
  "utf8",
);

assert.match(runtime, /analytics: true/);
for (const operation of [
  "getFinancialOverview",
  "getMonthlySpending",
  "getMonthlyCategoryTransactions",
]) {
  assert.match(runtime, new RegExp(`syncThenDatabase[\\s\\S]*\\.${operation}`));
  assert.match(worker, new RegExp(`function ${operation}`));
  assert.match(worker, new RegExp(`case "${operation}"`));
}
assert.match(schema, /local_transactions_budget_date/);
assert.match(schema, /local_transactions_budget_month/);
assert.match(worker, /LIMIT 250/);
assert.match(worker, /NOT EXISTS \([\s\S]*local_transaction_splits/);
assert.match(worker, /account\.participation NOT IN \('tracking', 'off-budget'\)/);
assert.match(worker, /netWorthTrend = monthWindow\(month, 12\)/);
assert.match(worker, /readyToAssign: budgetView\.readyToAssign/);
assert.match(worker, /transactions: \[\]/);

console.log(
  "Milestone 4 local analytics contracts passed: indexed overview, 12-month net worth, grouped spending, and bounded category drilldown.",
);
