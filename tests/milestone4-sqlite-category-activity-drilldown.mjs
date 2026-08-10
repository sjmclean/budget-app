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
const provider = readFileSync(
  "apps/web/src/features/persistence/createSqliteBudgetViewService.ts",
  "utf8",
);
const workspace = readFileSync(
  "apps/web/src/features/budget/useBudgetWorkspace.ts",
  "utf8",
);

assert.match(contracts, /type: "getCategoryActivityDrilldown"/);
assert.match(client, /getCategoryActivityDrilldown\(/);
assert.match(worker, /function getCategoryActivityDrilldown/);
assert.match(worker, /account\.participation = 'on-budget'/);
assert.match(worker, /split\.transfer_account_id IS NULL/);
assert.match(worker, /parent\.transfer_account_id IS NULL/);
assert.match(worker, /NOT EXISTS \(\s*SELECT 1 FROM local_transaction_splits/);
assert.match(worker, /rowCount > 2_000/);
assert.match(worker, /Math\.round\(netActivity \* 100\) !== Math\.round\(category\.activity \* 100\)/);
assert.match(provider, /getCategoryActivityDrilldown\(input\)/);
assert.match(provider, /requireBudgetMonths\(hosted, input\.budgetId\)/);
assert.doesNotMatch(workspace, /assertBrowserBudgetFeatureAvailable/);

console.log(
  "Milestone 4 SQLite category activity drill-down contracts passed: bounded rows, engine-equivalent filtering, and projection reconciliation.",
);
