import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync(
  new URL("../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts", import.meta.url),
  "utf8",
);

test("reconciliation updates statuses in one guarded SQL statement without rewriting transaction relationships", () => {
  const start = worker.indexOf("function completeReconciliation(request:");
  const end = worker.indexOf("\nfunction writeTransactionBatch(", start);
  assert.ok(start !== -1 && end > start);
  const completion = worker.slice(start, end);
  assert.match(completion, /UPDATE local_transactions SET cleared_status = 'reconciled', updated_at = \?/);
  assert.match(completion, /date <= \? AND cleared_status = 'cleared'/);
  assert.match(completion, /SELECT changes\(\) AS count/);
  assert.match(completion, /updatedCount !== request\.writes\.length/);
  assert.match(completion, /insertOutbox\(mutation\)/);
  assert.match(completion, /BEGIN IMMEDIATE/);
  assert.match(completion, /COMMIT/);
  assert.match(completion, /ROLLBACK/);
  assert.doesNotMatch(completion, /applyTransactionBatchInCurrentTransaction/);
  assert.doesNotMatch(completion, /upsertTransaction\(/);
});
