import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(
  "apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
  "utf8",
);
const adapter = readFileSync(
  "apps/web/src/features/persistence/localFirst/sqliteBudgetProjectionAdapter.ts",
  "utf8",
);
const runtime = readFileSync(
  "apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts",
  "utf8",
);

for (const table of [
  "local_budget_projection_cache",
  "local_budget_projection_dirty",
]) {
  assert.match(worker, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
}
assert.match(worker, /function markBudgetProjectionDirty/);
assert.match(worker, /function markAllBudgetProjectionsDirty/);
assert.match(worker, /function readBudgetMonthSnapshot/);
assert.match(worker, /function readBudgetMonth\(month: string\): BudgetMonthView \| null/);
assert.match(worker, /SELECT MAX\(month\) AS month FROM local_budget_months/);
assert.match(worker, /const BUDGET_PROJECTION_ENGINE_VERSION = 5/);
assert.match(worker, /FROM local_budget_projection_dirty WHERE budget_id = \?/);
assert.match(worker, /dirtyMonth && dirtyMonth <= targetMonth/);
assert.match(worker, /engine_version < \?/);
assert.match(worker, /markBudgetProjectionDirty\(legacyAnchor\)/);
assert.match(worker, /category-overspending-policy/);
assert.match(worker, /WHERE budget_id = \? AND month >= \? ORDER BY month/);
assert.match(worker, /openingPreviousOverspending: snapshotPreviousOverspending/);
assert.match(worker, /for \(const projectedMonth of diagnostic\.projections\)/);
assert.match(worker, /applyBudgetProjectionToSnapshot\(snapshot, projection\)/);
assert.match(worker, /DELETE FROM local_budget_projection_cache WHERE budget_id = \? AND month >= \?/);
assert.match(worker, /previousMonth && previousMonth < transaction\.date\.slice\(0, 7\)/);
assert.match(worker, /mergeBudgetCategoryProjectionFacts/);
assert.match(adapter, /export function applyBudgetProjectionToSnapshot/);

const categoryMutation = runtime.slice(
  runtime.indexOf("async mutateCategory"),
  runtime.indexOf("async getCategoryMergePreview"),
);
assert.match(categoryMutation, /return client\.getBudgetMonthView/);

console.log(
  "Milestone 4 authoritative budget projection contracts passed: derived reads, forward invalidation, cache disposal, and mutation rereads.",
);
