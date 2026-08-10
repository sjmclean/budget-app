import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(
  "apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
  "utf8",
);
const client = readFileSync(
  "apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts",
  "utf8",
);
const service = readFileSync(
  "apps/web/src/features/persistence/replicationService.ts",
  "utf8",
);

const batchStart = worker.indexOf("function writeTransactionBatch");
const batchEnd = worker.indexOf("function deleteTransaction", batchStart);
const batch = worker.slice(batchStart, batchEnd);
assert.ok(batchStart >= 0);
assert.match(batch, /BEGIN IMMEDIATE/);
assert.match(batch, /for \(const \{ transaction, mutation \} of writes\)/);
assert.match(batch, /upsertTransaction\(transaction\)/);
assert.match(batch, /insertOutbox\(mutation\)/);
assert.ok(batch.indexOf("insertOutbox") < batch.indexOf('execute("COMMIT")'));
assert.match(batch, /ROLLBACK/);

const transactionWrites = client.slice(
  client.indexOf("async addTransaction"),
  client.indexOf("async listAccounts"),
);
assert.match(transactionWrites, /local\.writeTransactionBatch\(writes\)/);
assert.match(
  transactionWrites,
  /notifyLocalFirstMutationCommitted\(input\.budgetId\)/,
);
assert.doesNotMatch(
  transactionWrites,
  /await synchronise\(input\.budgetId\)/,
);

assert.match(service, /subscribeToLocalFirstMutationCommits/);
assert.match(service, /mutationDebounceMs = options\.debounceMs \?\? 250/);
assert.match(service, /mutationDebounceTimer = setTimeout/);
assert.match(service, /unsubscribeMutationCommits\(\)/);

assert.match(client, /SYNC_EPOCH_KEY_PREFIX/);
assert.match(client, /if \(!remote\)[\s\S]*cachedSyncEpoch[\s\S]*next\.open/);

console.log(
  "Milestone 4 atomic local commits and background sync contracts passed.",
);
