import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(
  "apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
  "utf8",
);
const contracts = readFileSync(
  "apps/web/src/features/persistence/localFirst/contracts.ts",
  "utf8",
);
const client = readFileSync(
  "apps/web/src/features/persistence/localFirst/localBudgetClient.ts",
  "utf8",
);
const runtime = readFileSync(
  "apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts",
  "utf8",
);

assert.match(worker, /CREATE TABLE IF NOT EXISTS local_budget_category_policies/);
assert.match(worker, /function backfillBudgetProjectionFacts/);
assert.match(worker, /INSERT OR IGNORE/);
assert.match(worker, /function getBudgetProjectionDiagnostic/);
assert.match(worker, /diagnoseSqliteBudgetProjection/);
assert.match(contracts, /type: "getBudgetProjectionDiagnostic"/);
assert.match(client, /getBudgetProjectionDiagnostic\(/);
assert.match(runtime, /BUDGET_ENGINE_DIAGNOSTIC_STORAGE_KEY/);

const authoritativeRead = runtime.slice(
  runtime.indexOf("async getBudgetMonthView"),
  runtime.indexOf("prefetchBudgetMonthView"),
);
assert.match(authoritativeRead, /readEntity<BudgetMonthView>/);
assert.match(authoritativeRead, /return view;/);
assert.doesNotMatch(authoritativeRead, /return diagnostic\.projection/);

console.log(
  "Milestone 4 SQLite projection worker contract passed: normalized backfill, diagnostic request, and view-boundary isolation.",
);
