import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import Database from "better-sqlite3";
import { createLocalFirstRelayStore } from "../../../apps/server/src/localFirstRelayStore.mjs";
import { emptyDomainCounts } from "../../../apps/web/src/features/persistence/localFirst/contracts";

function harness() {
  const directory = mkdtempSync(join(tmpdir(), "budget-restore-relay-"));
  const database = new Database(":memory:");
  const store = createLocalFirstRelayStore(database, { blobDirectory: directory });
  const budgetId = "restore-budget";
  const oldEpoch = store.resetEpoch(budgetId, 1).syncEpoch;
  const content = Buffer.from("complete staged SQLite payload");
  const contentHash = `sha256:${createHash("sha256").update(content).digest("hex")}`;
  const manifest = { budgetId, syncEpoch: oldEpoch, schemaVersion: 1,
    counts: { ...emptyDomainCounts(), transactions: 100 }, chunkCount: 1,
    totalBytes: content.length, contentHash, baseCursor: 0, previousBaselineId: null };
  const initial = store.beginBaseline(budgetId, oldEpoch, manifest);
  store.saveBaselineChunk(budgetId, oldEpoch, initial.baselineId, 0, contentHash, content);
  store.commitBaseline(budgetId, oldEpoch, initial.baselineId);
  const nextManifest = { ...manifest, syncEpoch: randomUUID(), counts: emptyDomainCounts() };
  function stage() {
    return store.beginRestore(budgetId, { syncEpoch: oldEpoch, latestCursor: 0, baselineId: initial.baselineId }, nextManifest);
  }
  return { store, budgetId, oldEpoch, initial, nextManifest, stage,
    upload: (id: string) => store.saveBaselineChunk(budgetId, nextManifest.syncEpoch, id, 0, contentHash, content),
    close() {
      database.close();
      assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + "\\") || resolve(directory).startsWith(resolve(tmpdir()) + "/"));
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("restore stages without changing authority, atomically starts a new epoch, and retries idempotently", () => {
  const h = harness();
  try {
    const staged = h.stage();
    assert.equal(h.store.getBootstrap(h.budgetId).syncEpoch, h.oldEpoch);
    assert.throws(() => h.store.commitBaseline(h.budgetId, h.nextManifest.syncEpoch, staged.baselineId, true), { code: "BASELINE_INCOMPLETE" });
    assert.equal(h.store.getBootstrap(h.budgetId).baseline.baselineId, h.initial.baselineId);
    h.upload(staged.baselineId);
    assert.throws(() => h.store.commitBaseline(h.budgetId, h.nextManifest.syncEpoch, staged.baselineId), { code: "RESTORE_REQUIRES_OWNER" });
    const committed = h.store.commitBaseline(h.budgetId, h.nextManifest.syncEpoch, staged.baselineId, true);
    const remote = h.store.getBootstrap(h.budgetId);
    assert.equal(remote.syncEpoch, h.nextManifest.syncEpoch);
    assert.equal(remote.latestCursor, 0);
    assert.equal(remote.baseline.manifest.counts.transactions, 0);
    assert.equal(h.store.commitBaseline(h.budgetId, h.nextManifest.syncEpoch, staged.baselineId, true).contentHash, committed.contentHash);
    assert.throws(() => h.store.pullMutations(h.budgetId, h.oldEpoch, 0, 10), { code: "STALE_SYNC_EPOCH" });
  } finally { h.close(); }
});

test("a concurrent epoch change rejects the staged restore without replacing the newer authority", () => {
  const h = harness();
  try {
    const staged = h.stage();
    h.upload(staged.baselineId);
    const changed = h.store.resetEpoch(h.budgetId, 1);
    assert.throws(() => h.store.commitBaseline(h.budgetId, h.nextManifest.syncEpoch, staged.baselineId, true), (error: any) =>
      error.code === "RESTORE_REJECTED" && error.details.restoreNotCommitted === true);
    assert.equal(h.store.getBootstrap(h.budgetId).syncEpoch, changed.syncEpoch);
  } finally { h.close(); }
});
