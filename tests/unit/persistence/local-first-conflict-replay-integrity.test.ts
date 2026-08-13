import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const clientSource = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts",
    import.meta.url,
  ),
  "utf8",
);

function replayConflictBody(): string {
  const start = clientSource.indexOf("async function replayConflictMutation(");
  const end = clientSource.indexOf("\n  async function ", start + 1);

  assert.notEqual(start, -1, "replayConflictMutation() must exist");
  assert.notEqual(end, -1, "replayConflictMutation() boundary must be found");

  return clientSource.slice(start, end);
}

test("keep-local conflict replay preserves multi-source payee merge semantics", () => {
  const body = replayConflictBody();

  assert.match(
    body,
    /sourcePayeeIds\?: readonly string\[\]/,
    "payee merge conflict payload must preserve sourcePayeeIds",
  );

  assert.match(
    body,
    /sourcePayeeIds:\s*target\.sourcePayeeIds/,
    "keep-local replay must pass every source payee back to mergePayees()",
  );
});

test("keep-local conflict replay refuses one-sided linked transfer replay", () => {
  const body = replayConflictBody();

  assert.match(
    body,
    /transfer conflict cannot be kept locally one side at a time/,
    "linked transfer conflicts must remain explicitly refused until mutations have logical grouping",
  );
});

const workerSource = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

test("keep-local conflict resolution is committed atomically with replay", () => {
  const body = replayConflictBody();

  assert.match(
    body,
    /conflictId/,
    "conflict replay must carry the conflict id into the worker mutation",
  );

  assert.doesNotMatch(
    clientSource,
    /await replayConflictMutation\(local,\s*conflict\.losingMutation\);[\s\S]{0,180}await local\.resolveSyncConflict\(conflictId,\s*resolution\)/,
    "keep-local must not replay and resolve in two separately committed worker calls",
  );

  assert.match(
    workerSource,
    /resolveLocalConflictInTransaction/,
    "worker must resolve keep-local conflicts inside the replay transaction",
  );
});
