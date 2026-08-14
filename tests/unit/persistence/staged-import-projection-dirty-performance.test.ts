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

function importRegisterBatchBody(): string {
  const start = source.indexOf(
    "function importRegisterBatch(",
  );

  assert.notEqual(
    start,
    -1,
    "importRegisterBatch should exist",
  );

  const end = source.indexOf(
    "\nfunction importEntityBatch(",
    start,
  );

  assert.notEqual(
    end,
    -1,
    "importEntityBatch should follow importRegisterBatch",
  );

  return source.slice(start, end);
}

test("staged transaction imports mark projection dirty once per batch", () => {
  const body = importRegisterBatchBody();

  const transactionLoopStart = body.indexOf(
    "for (const transaction of batch.transactions ?? [])",
  );

  assert.notEqual(
    transactionLoopStart,
    -1,
    "transaction import loop should exist",
  );

  const afterTransactionLoop = body.indexOf(
    "if ((batch.accounts?.length ?? 0)",
    transactionLoopStart,
  );

  assert.notEqual(
    afterTransactionLoop,
    -1,
    "account/category invalidation should follow transaction imports",
  );

  const transactionSection = body.slice(
    transactionLoopStart,
    afterTransactionLoop,
  );

  assert.doesNotMatch(
    transactionSection,
    /upsertTransaction\(transaction\);\s*markBudgetProjectionDirty\(/,
    "transaction imports should not perform projection invalidation for every row",
  );

  assert.match(
    transactionSection,
    /earliestTransactionMonth/,
    "transaction imports should retain the earliest month in the batch",
  );

  assert.match(
    transactionSection,
    /if \(earliestTransactionMonth\)[\s\S]*markBudgetProjectionDirty\(earliestTransactionMonth\)/,
    "the batch should invalidate projection state once from its earliest month",
  );
});

test("projection dirty helper preserves the earliest dirty boundary", () => {
  const start = source.indexOf(
    "function markBudgetProjectionDirty(",
  );

  const end = source.indexOf(
    "\nfunction markAllBudgetProjectionsDirty(",
    start,
  );

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const body = source.slice(start, end);

  assert.match(
    body,
    /WHEN excluded\.earliest_month < earliest_month[\s\S]*THEN excluded\.earliest_month ELSE earliest_month END/,
    "dirty projection state must continue preserving the earliest affected month",
  );

  assert.match(
    body,
    /DELETE FROM local_budget_projection_cache WHERE budget_id = \? AND month >= \?/,
    "projection cache invalidation must continue covering every month from the dirty boundary",
  );
});
