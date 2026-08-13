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

function functionBody(name: string): string {
  const start = clientSource.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `${name}() must exist`);

  const next = clientSource.indexOf("\n  async function ", start + 1);
  return clientSource.slice(start, next === -1 ? undefined : next);
}

test("same-epoch baseline replacement drains pending local mutations first", () => {
  assert.match(
    clientSource,
    /async function drainLocalOutbox\s*\(/,
    "outbox publication must be reusable outside the ordinary sync loop",
  );

  const ready = functionBody("readyDatabase");

  const mismatch = ready.match(
    /if\s*\(\s*syncState\.baselineHash !== remote\.baseline\.manifest\.contentHash[\s\S]*?bootstrapLocalBudget\(\{/,
  )?.[0];

  assert.ok(mismatch, "same-epoch baseline mismatch branch must exist");

  const drainIndex = mismatch.indexOf("drainLocalOutbox");
  const rebuildIndex = mismatch.indexOf("bootstrapLocalBudget");

  assert.ok(
    drainIndex >= 0 && drainIndex < rebuildIndex,
    "pending local mutations must be published before same-epoch baseline replacement",
  );
});

test("stale-epoch recovery refuses to discard a non-empty local outbox", () => {
  const ready = functionBody("readyDatabase");

  assert.match(
    ready,
    /cachedSyncEpoch[\s\S]*?cachedSyncEpoch !== remote\.syncEpoch/,
    "startup recovery must detect a locally cached generation before opening the remote generation",
  );

  const remoteOpenIndex = ready.indexOf("syncEpoch: remote.syncEpoch");
  assert.ok(remoteOpenIndex >= 0, "remote-generation open must exist");

  const beforeRemoteOpen = ready.slice(0, remoteOpenIndex);

  assert.match(
    beforeRemoteOpen,
    /readOutbox\s*\(/,
    "old-generation outbox must be inspected before opening the new generation",
  );

  assert.match(
    beforeRemoteOpen,
    /UNSYNCED_LOCAL_CHANGES|unsynced local changes/i,
    "stale-epoch recovery must refuse destructive replacement when local mutations remain",
  );
});


const workerSource = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

test("worker refuses baseline replacement while the open database has pending outbox mutations", () => {
  const start = workerSource.indexOf("async function beginBaselineReplacement(");
  assert.notEqual(start, -1, "beginBaselineReplacement() must exist");

  const end = workerSource.indexOf(
    "\nasync function appendBaselineReplacement(",
    start,
  );
  assert.notEqual(end, -1, "appendBaselineReplacement() must follow");

  const body = workerSource.slice(start, end);

  assert.match(
    body,
    /local_budget_outbox/,
    "baseline replacement must inspect the current device outbox",
  );

  assert.match(
    body,
    /UNSYNCED_LOCAL_CHANGES|unsynced local changes/i,
    "baseline replacement must refuse to destroy pending local intent",
  );
});
