import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

function financialOverviewBody(): string {
  const match = source.match(
    /function getFinancialOverview\([\s\S]*?\n\}/,
  );

  assert.ok(match, "getFinancialOverview should exist");
  return match[0];
}

test("financial overview does not rescan cumulative transaction history for every trend month", () => {
  const body = financialOverviewBody();

  assert.doesNotMatch(
    body,
    /monthWindow\(month,\s*12\)\.map\([\s\S]*?SELECT COALESCE\(SUM\(amount\),\s*0\)[\s\S]*?date\s*<=\s*\?/,
    "net worth trend should not issue one cumulative history SUM per month",
  );
});

test("financial overview aggregates historical net worth deltas by indexed budget month", () => {
  const body = financialOverviewBody();

  assert.match(
    body,
    /SELECT substr\(date,\s*1,\s*7\) AS month[\s\S]*?SUM\(amount\) AS amount/,
    "net worth trend should aggregate transaction deltas by month",
  );

  assert.match(
    body,
    /WHERE budget_id\s*=\s*\?[\s\S]*?substr\(date,\s*1,\s*7\)\s*<=\s*\?/,
    "net worth trend should use the indexed budget-month expression through the target month",
  );

  assert.match(
    body,
    /GROUP BY substr\(date,\s*1,\s*7\)/,
    "net worth trend should group transaction deltas by month",
  );
});

test("financial overview derives twelve cumulative trend points in memory", () => {
  const body = financialOverviewBody();

  assert.match(
    body,
    /monthWindow\(month,\s*12\)/,
    "financial overview should retain the twelve-month trend window",
  );

  assert.match(
    body,
    /runningNetWorth/,
    "financial overview should accumulate monthly deltas in memory",
  );
});
