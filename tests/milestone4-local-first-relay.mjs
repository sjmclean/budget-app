import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  createLocalFirstRelayStore,
  LOCAL_FIRST_REQUIRED_DOMAINS,
} from "../apps/server/src/localFirstRelayStore.mjs";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "budget-app-local-first-relay-"));
const database = new Database(":memory:");
const relay = createLocalFirstRelayStore(database, {
  blobDirectory: temporaryDirectory,
});

try {
  const budgetId = "budget-one";
  const updatedMetadata = relay.updateBudgetMetadata(budgetId, {
    budgetName: "Household",
    currency: "aud",
  });
  assert.deepEqual(
    updatedMetadata,
    {
      budgetId,
      budgetName: "Household",
      currency: "AUD",
      updatedAt: updatedMetadata.updatedAt,
    },
  );
  const initial = relay.getBootstrap(budgetId);
  assert.equal(initial.baseline, null);
  assert.equal(initial.latestCursor, 0);

  const firstChunk = Buffer.from("complete local sqlite ");
  const secondChunk = Buffer.from("baseline bytes");
  const complete = Buffer.concat([firstChunk, secondChunk]);
  const counts = Object.fromEntries(
    LOCAL_FIRST_REQUIRED_DOMAINS.map((domain, index) => [domain, index + 1]),
  );
  const manifest = {
    budgetId,
    syncEpoch: initial.syncEpoch,
    schemaVersion: initial.schemaVersion,
    counts,
    chunkCount: 2,
    totalBytes: complete.length,
    contentHash: hash(complete),
    baseCursor: 0,
    previousBaselineId: null,
  };
  const staging = relay.beginBaseline(budgetId, initial.syncEpoch, manifest);
  relay.saveBaselineChunk(
    budgetId,
    initial.syncEpoch,
    staging.baselineId,
    0,
    hash(firstChunk),
    firstChunk,
  );
  assert.throws(
    () => relay.commitBaseline(budgetId, initial.syncEpoch, staging.baselineId),
    (error) => error.code === "BASELINE_INCOMPLETE",
  );
  relay.saveBaselineChunk(
    budgetId,
    initial.syncEpoch,
    staging.baselineId,
    1,
    hash(secondChunk),
    secondChunk,
  );

  const committed = relay.commitBaseline(
    budgetId,
    initial.syncEpoch,
    staging.baselineId,
  );
  assert.equal(committed.contentHash, manifest.contentHash);
  const legacyManifest = { ...manifest };
  delete legacyManifest.baseCursor;
  database.prepare(`
    UPDATE local_first_baselines
    SET manifest_json = ?
    WHERE baseline_id = ?
  `).run(JSON.stringify(legacyManifest), staging.baselineId);
  assert.equal(
    relay.getBootstrap(budgetId).baseline.manifest.baseCursor,
    0,
    "protocol 1 baselines must migrate to the safe cursor-zero boundary",
  );
  assert.equal(relay.pullMutations(budgetId, initial.syncEpoch, 0, 10).baseCursor, 0);
  assert.deepEqual(
    relay.readBaselineChunk(
      budgetId,
      initial.syncEpoch,
      staging.baselineId,
      1,
    ).content,
    secondChunk,
  );

  const emptyBytes = Buffer.from("empty sqlite baseline");
  const destructiveManifest = {
    ...manifest,
    counts: Object.fromEntries(
      LOCAL_FIRST_REQUIRED_DOMAINS.map((domain) => [domain, 0]),
    ),
    chunkCount: 1,
    totalBytes: emptyBytes.length,
    contentHash: hash(emptyBytes),
    previousBaselineId: staging.baselineId,
  };
  const destructive = relay.beginBaseline(
    budgetId,
    initial.syncEpoch,
    destructiveManifest,
  );
  relay.saveBaselineChunk(
    budgetId,
    initial.syncEpoch,
    destructive.baselineId,
    0,
    hash(emptyBytes),
    emptyBytes,
  );
  assert.throws(
    () => relay.commitBaseline(
      budgetId,
      initial.syncEpoch,
      destructive.baselineId,
    ),
    (error) => error.code === "BASELINE_DATA_REGRESSION",
    "an empty local file must not replace a populated relay baseline",
  );

  const mutations = [
    {
      mutationId: "mutation-one",
      deviceId: "device-a",
      deviceSequence: 1,
      baseCursor: 0,
      domain: "transactions",
      entityId: "transaction-one",
      operation: "upsert",
      payload: { amount: 100 },
    },
    {
      mutationId: "mutation-two",
      deviceId: "device-b",
      deviceSequence: 1,
      baseCursor: 0,
      domain: "transactions",
      entityId: "transaction-two",
      operation: "upsert",
      payload: { amount: -50 },
    },
  ];
  const pushed = relay.pushMutations(budgetId, initial.syncEpoch, mutations);
  assert.equal(pushed.acknowledgedCount, 2);
  assert.equal(relay.pushMutations(budgetId, initial.syncEpoch, mutations).acceptedCount, 0);
  const pulled = relay.pullMutations(budgetId, initial.syncEpoch, 0, 1);
  assert.equal(pulled.mutations.length, 1);
  assert.equal(pulled.hasMore, true);
  assert.equal(
    relay.pullMutations(
      budgetId,
      initial.syncEpoch,
      pulled.mutations[0].cursor,
      10,
    ).mutations[0].mutation.mutationId,
    "mutation-two",
  );
  const competingMutation = {
    ...mutations[0],
    mutationId: "mutation-three",
    deviceId: "device-c",
    deviceSequence: 1,
    baseCursor: 0,
    payload: { amount: 125 },
  };
  const conflictPush = relay.pushMutations(
    budgetId,
    initial.syncEpoch,
    [competingMutation],
  );
  assert.equal(conflictPush.detectedConflictCount, 1);
  const conflictEnvelope = relay.pullMutations(
    budgetId,
    initial.syncEpoch,
    pushed.latestCursor,
    10,
  ).mutations[0];
  assert.equal(conflictEnvelope.conflict.losingMutation.mutationId, "mutation-one");
  assert.equal(conflictEnvelope.conflict.winningMutation.mutationId, "mutation-three");
  assert.equal(conflictEnvelope.conflict.winningCursor, conflictEnvelope.cursor);

  const compactedBytes = Buffer.from("replacement sqlite baseline");
  const compactedManifest = {
    ...manifest,
    chunkCount: 1,
    totalBytes: compactedBytes.length,
    contentHash: hash(compactedBytes),
    baseCursor: conflictPush.latestCursor,
    previousBaselineId: staging.baselineId,
  };
  const replacement = relay.beginBaseline(
    budgetId,
    initial.syncEpoch,
    compactedManifest,
  );
  const competing = relay.beginBaseline(
    budgetId,
    initial.syncEpoch,
    compactedManifest,
  );
  for (const candidate of [replacement, competing]) {
    relay.saveBaselineChunk(
      budgetId,
      initial.syncEpoch,
      candidate.baselineId,
      0,
      hash(compactedBytes),
      compactedBytes,
    );
  }
  const compacted = relay.commitBaseline(
    budgetId,
    initial.syncEpoch,
    replacement.baselineId,
  );
  assert.equal(compacted.baseCursor, conflictPush.latestCursor);
  assert.equal(compacted.compactedMutationCount, 3);
  assert.deepEqual(
    relay.readBaselineChunk(
      budgetId,
      initial.syncEpoch,
      staging.baselineId,
      1,
    ).content,
    secondChunk,
    "the previous committed baseline must remain available as a recovery point",
  );
  assert.throws(
    () => relay.pullMutations(budgetId, initial.syncEpoch, 0, 10),
    (error) =>
      error.code === "CURSOR_COMPACTED" &&
      error.baseCursor === conflictPush.latestCursor,
  );
  assert.equal(
    relay.pullMutations(
      budgetId,
      initial.syncEpoch,
      conflictPush.latestCursor,
      10,
    ).mutations.length,
    0,
  );
  assert.throws(
    () => relay.commitBaseline(
      budgetId,
      initial.syncEpoch,
      competing.baselineId,
    ),
    (error) => error.code === "BASELINE_SUPERSEDED",
  );

  const reset = relay.resetEpoch(budgetId, 1);
  assert.notEqual(reset.syncEpoch, initial.syncEpoch);
  assert.equal(relay.getBootstrap(budgetId).baseline, null);
  assert.throws(
    () => relay.pullMutations(budgetId, initial.syncEpoch, 0, 10),
    (error) =>
      error.code === "STALE_SYNC_EPOCH" &&
      error.expectedSyncEpoch === reset.syncEpoch,
  );

  assert.throws(
    () => relay.beginBaseline(budgetId, reset.syncEpoch, {
      ...manifest,
      syncEpoch: reset.syncEpoch,
      counts: { accounts: 1 },
    }),
    (error) => error.code === "INCOMPLETE_BASELINE_MANIFEST",
  );

  console.log(
    "Milestone 4 local-first relay passed: complete chunked baseline, ordered idempotent mutations, and stale-epoch refusal.",
  );
} finally {
  database.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

function hash(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}
