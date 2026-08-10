import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const relay = readFileSync(
  "apps/server/src/localFirstRelayStore.mjs",
  "utf8",
);
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

assert.match(relay, /previous\.cursor > mutation\.baseCursor/);
assert.match(relay, /mutationsAreEquivalent\(losingMutation, mutation\)/);
assert.match(relay, /conflict_json/);
assert.match(worker, /CREATE TABLE IF NOT EXISTS local_budget_sync_conflicts/);
assert.match(worker, /conflict\.losingMutation\.deviceId === readMetadata\("deviceId"\)/);
assert.match(
  worker,
  /commitBaselineReplacement[\s\S]*DELETE FROM local_budget_outbox[\s\S]*DELETE FROM local_budget_sync_conflicts/,
);

const applyStart = worker.indexOf("function applyRemoteMutations");
const applyEnd = worker.indexOf("function readPulledCursor", applyStart);
const atomicApply = worker.slice(applyStart, applyEnd);
assert.ok(
  atomicApply.indexOf("local_budget_sync_conflicts") <
    atomicApply.indexOf('execute("COMMIT")'),
  "conflict detection must commit atomically with the winning mutation and cursor",
);

assert.match(client, /replayConflictMutation/);
assert.match(client, /resolveSyncConflict/);
assert.match(service, /listSyncConflicts/);
assert.match(service, /unresolvedConflictCount: conflicts\.length/);

console.log(
  "Milestone 4 local-first conflict recovery contracts passed.",
);
