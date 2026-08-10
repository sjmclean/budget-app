import assert from "node:assert/strict";
import { createSHA256 } from "hash-wasm";
import {
  bootstrapLocalBudget,
  publishLocalBaseline,
  type LocalBaselineDatabasePort,
} from "../apps/web/src/features/persistence/localFirst/baselineCoordinator";
import {
  LOCAL_FIRST_BASELINE_CHUNK_BYTES,
  type RelayBaselineManifest,
} from "../apps/web/src/features/persistence/localFirst/relayTransport";
import {
  emptyDomainCounts,
  type LocalBudgetManifest,
} from "../apps/web/src/features/persistence/localFirst/contracts";

const budgetId = "budget";
const syncEpoch = "epoch";
const bytes = new Uint8Array(LOCAL_FIRST_BASELINE_CHUNK_BYTES * 2 + 137);
for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251;
const contentHash = await hash(bytes);
const localManifest: LocalBudgetManifest = {
  budgetId,
  syncEpoch,
  schemaVersion: 1,
  localRevision: 10,
  durable: true,
  counts: { ...emptyDomainCounts(), accounts: 2, transactions: 500 },
};

let maximumRead = 0;
let baselineExportFinished = false;
const uploaded: Uint8Array[] = [];
const publishDatabase: LocalBaselineDatabasePort = {
  async getManifest() { return localManifest; },
  async prepareBaselineExport() { return { totalBytes: bytes.length }; },
  async readBaselineExportChunk(offset, length) {
    maximumRead = Math.max(maximumRead, length);
    return bytes.slice(offset, offset + length);
  },
  async finishBaselineExport() { baselineExportFinished = true; },
  async open() { return localManifest; },
  async beginBaselineReplacement() {},
  async appendBaselineReplacement() { return { receivedBytes: 0 }; },
  async commitBaselineReplacement() { return localManifest; },
  async abortBaselineReplacement() {},
};
const relay = {
  async getBootstrap() {
    return {
      protocolVersion: 2,
      budgetId,
      syncEpoch,
      schemaVersion: 1,
      latestCursor: 0,
      baseline: null,
    };
  },
  async beginBaseline(manifest: RelayBaselineManifest) {
    assert.equal(manifest.contentHash, contentHash);
    return { baselineId: "baseline", chunkCount: manifest.chunkCount };
  },
  async uploadBaselineChunk(input: { content: Uint8Array }) {
    uploaded.push(Uint8Array.from(input.content));
    return {};
  },
  async commitBaseline() {
    return {
      baselineId: "baseline",
      contentHash,
      totalBytes: bytes.length,
      committedAt: new Date().toISOString(),
    };
  },
} as never;

const published = await publishLocalBaseline({
  budgetId,
  syncEpoch,
  database: publishDatabase,
  relay,
});
assert.equal(published.chunkCount, 3);
assert.ok(maximumRead <= LOCAL_FIRST_BASELINE_CHUNK_BYTES);
assert.deepEqual(concatenate(uploaded), bytes);
assert.equal(
  baselineExportFinished,
  true,
  "The prepared baseline snapshot must remain readable through hashing and upload, then be released.",
);

let destructiveUploadStarted = false;
const emptyPublishDatabase: LocalBaselineDatabasePort = {
  ...publishDatabase,
  async getManifest() {
    return { ...localManifest, counts: emptyDomainCounts() };
  },
  async getSyncState() {
    return {
      budgetId,
      syncEpoch,
      baselineHash: null,
      pulledCursor: 0,
    };
  },
};
const populatedRelay = {
  ...relay,
  async getBootstrap() {
    return {
      protocolVersion: 2,
      budgetId,
      syncEpoch,
      schemaVersion: 1,
      latestCursor: 0,
      baseline: {
        baselineId: "populated-baseline",
        manifest: {
          budgetId,
          syncEpoch,
          schemaVersion: 1,
          counts: localManifest.counts,
          chunkCount: 3,
          totalBytes: bytes.length,
          contentHash,
          baseCursor: 0,
          previousBaselineId: null,
        },
        committedAt: new Date().toISOString(),
      },
    };
  },
  async beginBaseline() {
    destructiveUploadStarted = true;
    return { baselineId: "must-not-start", chunkCount: 1 };
  },
} as never;
await assert.rejects(
  publishLocalBaseline({
    budgetId,
    syncEpoch,
    database: emptyPublishDatabase,
    relay: populatedRelay,
  }),
  /Refusing to publish an unexplained destructive baseline/,
);
assert.equal(destructiveUploadStarted, false);

let maximumAppend = 0;
const downloaded: Uint8Array[] = [];
let aborted = false;
const bootstrapDatabase: LocalBaselineDatabasePort = {
  async getManifest() { return localManifest; },
  async prepareBaselineExport() { return { totalBytes: 0 }; },
  async readBaselineExportChunk() { return new Uint8Array(); },
  async open() { return localManifest; },
  async beginBaselineReplacement(input) {
    assert.equal(input.totalBytes, bytes.length);
  },
  async appendBaselineReplacement(_offset, chunk) {
    maximumAppend = Math.max(maximumAppend, chunk.byteLength);
    downloaded.push(Uint8Array.from(chunk));
    return { receivedBytes: downloaded.reduce((sum, value) => sum + value.length, 0) };
  },
  async commitBaselineReplacement() { return localManifest; },
  async abortBaselineReplacement() { aborted = true; },
};
const completeManifest: RelayBaselineManifest = {
  budgetId,
  syncEpoch,
  schemaVersion: 1,
  counts: localManifest.counts,
  chunkCount: 3,
  totalBytes: bytes.length,
  contentHash,
  baseCursor: 0,
  previousBaselineId: null,
};
const downloadRelay = {
  async getBootstrap() {
    return {
      protocolVersion: 2,
      budgetId,
      syncEpoch,
      schemaVersion: 1,
      latestCursor: 0,
      baseline: {
        baselineId: "baseline",
        manifest: completeManifest,
        committedAt: new Date().toISOString(),
      },
    };
  },
  async downloadBaselineChunk(input: { chunkIndex: number }) {
    const offset = input.chunkIndex * LOCAL_FIRST_BASELINE_CHUNK_BYTES;
    return bytes.slice(offset, offset + LOCAL_FIRST_BASELINE_CHUNK_BYTES);
  },
} as never;
const bootstrapped = await bootstrapLocalBudget({
  budgetId,
  deviceId: "device",
  database: bootstrapDatabase,
  relay: downloadRelay,
  localState: null,
});
assert.equal(bootstrapped.status, "ready");
assert.equal(aborted, false);
assert.ok(maximumAppend <= LOCAL_FIRST_BASELINE_CHUNK_BYTES);
assert.deepEqual(concatenate(downloaded), bytes);

const corruptRelay = {
  ...downloadRelay,
  async downloadBaselineChunk(input: { chunkIndex: number }) {
    const value = await downloadRelay.downloadBaselineChunk(input);
    if (input.chunkIndex === 2) value[0] ^= 1;
    return value;
  },
} as never;
await assert.rejects(
  bootstrapLocalBudget({
    budgetId,
    deviceId: "device",
    database: bootstrapDatabase,
    relay: corruptRelay,
    localState: null,
  }),
  /integrity validation/,
);
assert.equal(aborted, true);

console.log(
  "Milestone 4 baseline streaming passed: bounded 4 MiB upload/download, complete hash verification, activation, and corrupt-download abort.",
);

async function hash(value: Uint8Array) {
  const hasher = await createSHA256();
  hasher.init();
  hasher.update(value);
  return `sha256:${hasher.digest("hex")}`;
}

function concatenate(values: readonly Uint8Array[]) {
  const result = new Uint8Array(values.reduce((sum, value) => sum + value.length, 0));
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.length;
  }
  return result;
}
