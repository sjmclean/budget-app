import assert from "node:assert/strict";
import test from "node:test";
import { createRestorePointReplacement } from "../../../apps/web/src/features/persistence/localFirst/restorePointReplacement";
import { emptyDomainCounts, type LocalBudgetManifest } from "../../../apps/web/src/features/persistence/localFirst/contracts";
import type { RelayBootstrap } from "../../../apps/web/src/features/persistence/localFirst/relayTransport";

function harness() {
  const events: string[] = [];
  const storage = new Map<string, string>();
  let authoritative = "original.sqlite3";
  let working = authoritative;
  let failure = "";
  let candidateEpoch = "";
  let remote: RelayBootstrap = { budgetId: "A", syncEpoch: "old-epoch", latestCursor: 0,
    schemaVersion: 1, protocolVersion: 2, baseline: null };
  const manifest = (): LocalBudgetManifest => ({ budgetId: "A", syncEpoch: working === "original.sqlite3" ? "old-epoch" : candidateEpoch,
    schemaVersion: 1, localRevision: 1, physicalFilename: working, durable: true, counts: emptyDomainCounts() });
  let uploadedManifest: any;
  const input: Parameters<typeof createRestorePointReplacement>[0] = {
    deviceId: "device",
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, value); events.push(value ? "journal-or-epoch" : "clear-intent"); },
      flush: async () => { events.push("flush"); },
    },
    database: {
      getManifest: async () => manifest(),
      getSyncState: async () => ({ budgetId: "A", syncEpoch: "old-epoch", baselineHash: null, pulledCursor: 0 }),
      setSyncState: async (baselineHash, pulledCursor) => ({ budgetId: "A", syncEpoch: candidateEpoch, baselineHash, pulledCursor }),
      prepareRestorePoint: async ({ syncEpoch }) => {
        events.push("prepare");
        if (failure === "prepare") throw new Error("quota");
        candidateEpoch = syncEpoch;
        working = "candidate.sqlite3";
        return { manifest: manifest(), supersededPhysicalFilename: "original.sqlite3" };
      },
      beginBaselineReplacement: async () => { events.push("begin-upload"); },
      appendBaselineReplacement: async (offset, content) => {
        events.push("append-upload");
        return { receivedBytes: offset + content.byteLength };
      },
      prepareUploadedRestore: async ({ syncEpoch }) => {
        events.push("prepare-upload");
        if (failure === "prepare") throw new Error("invalid database");
        candidateEpoch = syncEpoch;
        working = "candidate.sqlite3";
        return { manifest: manifest(), supersededPhysicalFilename: "original.sqlite3" };
      },
      abortBaselineReplacement: async () => { events.push("abort-upload"); },
      openPreparedRestorePoint: async (promotion) => { working = "candidate.sqlite3"; events.push("reopen"); return promotion; },
      abortPreparedRestorePoint: async () => { working = "original.sqlite3"; events.push("abort"); },
      commitPreparedRestorePoint: async () => {
        if (failure === "publish") throw new Error("pointer flush failed");
        authoritative = working;
        events.push("publish");
        return manifest();
      },
      isGenerationPublished: () => authoritative === "candidate.sqlite3",
      prepareBaselineExport: async () => ({ totalBytes: 512 }),
      readBaselineExportChunk: async () => new Uint8Array(512),
      finishBaselineExport: async () => { events.push("finish-export"); },
    },
    relay: {
      getBootstrap: async () => remote,
      beginRestore: async (_expected, next) => { uploadedManifest = next; events.push("stage-relay"); return { baselineId: "staged", chunkCount: 1 }; },
      uploadBaselineChunk: async () => {
        events.push("upload");
        if (failure === "upload") throw new Error("network offline");
        return {};
      },
      commitRestore: async () => {
        events.push("commit-relay");
        if (failure === "rejected") throw Object.assign(new Error("concurrent edit"), { details: { restoreNotCommitted: true } });
        remote = { ...remote, syncEpoch: candidateEpoch,
          baseline: { baselineId: "staged", manifest: uploadedManifest, committedAt: new Date().toISOString() } };
        if (failure === "acknowledgement") throw new Error("lost response");
        return { baselineId: "staged", contentHash: uploadedManifest.contentHash, totalBytes: 512 };
      },
    },
  };
  return { service: createRestorePointReplacement(input), events, storage,
    authoritative: () => authoritative, epoch: () => remote.syncEpoch,
    fail: (value: string) => { failure = value; } };
}

test("internal restore publishes only after durable intent and atomic relay commit", async () => {
  const h = harness();
  const restored = await h.service.restore("A", "point");
  assert.equal(h.authoritative(), "candidate.sqlite3");
  assert.equal(restored.syncEpoch, h.epoch());
  assert.ok(h.events.indexOf("upload") < h.events.indexOf("journal-or-epoch"));
  assert.ok(h.events.indexOf("flush") < h.events.indexOf("commit-relay"));
  assert.ok(h.events.indexOf("commit-relay") < h.events.indexOf("publish"));
  assert.equal(h.events.at(-2), "clear-intent");
});

test("manual SQLite restore makes the restored image authoritative in a new epoch", async () => {
  const h = harness();
  const oldEpoch = h.epoch();
  const restored = await h.service.restoreDatabase("A", new Blob([new Uint8Array(512)]));
  assert.notEqual(restored.syncEpoch, oldEpoch);
  assert.equal(restored.syncEpoch, h.epoch());
  assert.equal(h.authoritative(), "candidate.sqlite3");
  assert.ok(h.events.indexOf("append-upload") < h.events.indexOf("commit-relay"));
  assert.ok(h.events.indexOf("commit-relay") < h.events.indexOf("publish"));
});

test("invalid manual SQLite input is rejected before either authority changes", async () => {
  const h = harness();
  h.fail("prepare");
  await assert.rejects(h.service.restoreDatabase("A", new Blob([new Uint8Array(512)])), /invalid database/);
  assert.equal(h.authoritative(), "original.sqlite3");
  assert.equal(h.epoch(), "old-epoch");
  assert.equal(h.events.includes("commit-relay"), false);
  assert.ok(h.events.includes("abort-upload"));
});

for (const failure of ["prepare", "upload", "rejected"]) {
  test(`${failure} failure preserves the authoritative generation and old epoch`, async () => {
    const h = harness();
    h.fail(failure);
    await assert.rejects(h.service.restore("A", "point"));
    assert.equal(h.authoritative(), "original.sqlite3");
    assert.equal(h.epoch(), "old-epoch");
    if (failure !== "prepare") assert.ok(h.events.includes("abort"));
    assert.equal(await h.service.recover("A"), false);
  });
}

for (const failure of ["acknowledgement", "publish"]) {
  test(`${failure} failure preserves the old local pointer and resolves via the durable journal`, async () => {
    const h = harness();
    h.fail(failure);
    await assert.rejects(h.service.restore("A", "point"), { code: "RESTORE_PENDING" });
    assert.equal(h.authoritative(), "original.sqlite3");
    assert.notEqual(h.epoch(), "old-epoch");
    assert.equal(h.events.includes("abort"), false);
    h.fail("");
    assert.equal(await h.service.recover("A"), true);
    assert.equal(h.authoritative(), "candidate.sqlite3");
    assert.equal(h.events.filter((event) => event === "commit-relay").length, 1);
    assert.equal(await h.service.recover("A"), false);
  });
}
