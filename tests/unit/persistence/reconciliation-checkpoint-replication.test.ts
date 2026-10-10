import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync("apps/web/src/features/persistence/localFirst/localBudget.worker.ts", "utf8");
const commands = readFileSync("apps/web/src/features/persistence/localFirst/engine/transactionCommands.ts", "utf8");

test("reconciliation publishes a checkpoint mutation alongside ordinary transaction status mutations", () => {
  assert.match(commands, /createMutation\([\s\S]*?"transactions", \x60reconciliation:/);
  assert.match(commands, /checkpointMutation,\s*\n\s*writes:/);
  assert.match(commands, /committedCommandResult\(result, \[\.\.\.mutations, checkpointMutation\]/);
  assert.match(worker, /insertOutbox\(request\.checkpointMutation\)/);
});

test("remote checkpoint replication persists metadata independently of a transaction row", () => {
  assert.match(worker, /mutation\.entityId\.startsWith\("reconciliation:"\)/);
  assert.match(worker, /storeReplicatedReconciliationCheckpoint\(checkpoint\)/);
  assert.match(worker, /ON CONFLICT\(id\) DO UPDATE SET/);
  assert.match(worker, /CREATE TABLE IF NOT EXISTS local_reconciliation_checkpoints/);
});

test("reconciliation checkpoint and transaction writes share the same atomic SQLite commit", () => {
  const start = worker.indexOf("function completeReconciliation(");
  const end = worker.indexOf("function writeTransactionBatch(", start);
  assert.ok(start >= 0 && end > start);
  const completion = worker.slice(start, end);
  assert.match(completion, /execute\("BEGIN IMMEDIATE"\)/);
  assert.match(completion, /UPDATE local_transactions SET cleared_status = 'reconciled', updated_at = \?/);
  assert.match(completion, /date <= \? AND cleared_status = 'cleared'/);
  assert.match(completion, /updatedCount !== request\.writes\.length/);
  assert.match(completion, /for \(const \{ mutation \} of request\.writes\) insertOutbox\(mutation\)/);
  assert.doesNotMatch(completion, /applyTransactionBatchInCurrentTransaction/);
  assert.match(completion, /INSERT INTO local_reconciliation_checkpoints/);
  assert.match(completion, /insertOutbox\(request\.checkpointMutation\)/);
  assert.match(completion, /execute\("COMMIT"\)/);
  assert.match(completion, /execute\("ROLLBACK"\)/);
});
