import assert from "node:assert/strict";
import { createPersistenceCheckpoint } from "../apps/web/src/features/persistence/checkpoint";
import { replicatePersistenceProvider } from "../apps/web/src/features/persistence/replicationEngine";
import type { ReplicationCursorState, ReplicationTransport } from "../apps/web/src/features/persistence/replication";

const canonicalEntries = {
  "budget-app.entity-replication.v1/account/account-1": JSON.stringify({ id: "account-1" }),
};
const checkpoint = createPersistenceCheckpoint({
  checkpointId: "checkpoint-integrity",
  deviceId: "device-server",
  throughSequence: 12,
  schemaVersion: 4,
  replicatedThroughCursor: 7,
  entries: canonicalEntries,
  createdAt: new Date("2026-07-27T00:00:00.000Z"),
});

function createHarness(initialHash: string) {
  let cursorState: ReplicationCursorState = {
    generationId: "generation-1",
    pushedLocalSequence: 0,
    pulledRemoteCursor: 7,
  };
  let localHash = initialHash;
  let restoreCount = 0;

  const provider = {
    operationJournal: {
      getJournalCursor: () => ({ deviceId: "device-local", latestSequence: 0 }),
      readJournal: async () => [],
    },
    checkpoints: {
      createCheckpoint: async () => checkpoint,
      getLatestCheckpoint: async () => null,
      listCheckpoints: async () => [],
      calculateStateIntegrityHash: async () => localHash,
      restoreCheckpoint: async () => {
        restoreCount += 1;
        localHash = checkpoint.integrityHash;
        return { restoredCheckpointId: checkpoint.checkpointId, appliedOperationCount: 0, entryCount: checkpoint.entryCount };
      },
    },
    replicationStore: {
      getReplicationCursorState: async () => cursorState,
      setReplicationCursorState: async (next: ReplicationCursorState) => { cursorState = next; },
      applyRemoteOperations: async () => 0,
      getReplicationDiagnostics: async () => ({
        deviceId: "device-local",
        latestLocalSequence: 0,
        retainedJournalEntryCount: 0,
        oldestRetainedSequence: null,
        latestCheckpointId: null,
        checkpointCount: 0,
        generationId: cursorState.generationId,
        pushedLocalSequence: cursorState.pushedLocalSequence,
        pulledRemoteCursor: cursorState.pulledRemoteCursor,
        unresolvedConflictCount: 0,
      }),
      pruneJournal: async () => 0,
      listConflicts: async () => [],
      resolveConflict: async () => undefined,
    },
    flush: async () => undefined,
  } as any;

  const transport: ReplicationTransport = {
    getGeneration: async () => ({
      protocolVersion: 2,
      generationId: "generation-1",
      latestCursor: 7,
      latestCheckpointId: checkpoint.checkpointId,
      latestCheckpointIntegrityHash: checkpoint.integrityHash,
      latestCheckpointRemoteCursor: 7,
    }),
    pushOperations: async () => ({ generationId: "generation-1", acceptedCount: 0, acknowledgedCount: 0, latestCursor: 7 }),
    pullOperations: async () => ({ generationId: "generation-1", operations: [], latestCursor: 7, hasMore: false }),
    uploadCheckpoint: async () => ({ checkpointId: checkpoint.checkpointId, acknowledgedThroughSequence: 12, integrityHash: checkpoint.integrityHash, replicatedThroughCursor: 7 }),
    getLatestCheckpoint: async () => checkpoint,
    hasBlob: async () => true,
    uploadBlob: async () => undefined,
    downloadBlob: async () => null,
  };

  return { provider, transport, getRestoreCount: () => restoreCount, getCursorState: () => cursorState };
}

{
  const harness = createHarness(checkpoint.integrityHash);
  const result = await replicatePersistenceProvider(harness.provider, harness.transport);
  assert.equal(result.integrityVerified, true);
  assert.equal(result.integrityRepairPerformed, false);
  assert.equal(harness.getRestoreCount(), 0);
}

{
  const harness = createHarness("0000000000000000");
  const result = await replicatePersistenceProvider(harness.provider, harness.transport);
  assert.equal(result.integrityVerified, true);
  assert.equal(result.integrityRepairPerformed, true);
  assert.equal(harness.getRestoreCount(), 1);
  assert.deepEqual(harness.getCursorState(), {
    generationId: "generation-1",
    pushedLocalSequence: 0,
    pulledRemoteCursor: 7,
  });
}

{
  const harness = createHarness(checkpoint.integrityHash);
  const uploaded: unknown[] = [];
  const transport = {
    ...harness.transport,
    getGeneration: async () => ({
      protocolVersion: 2 as const,
      generationId: "generation-1",
      latestCursor: 7,
      latestCheckpointId: null,
      latestCheckpointIntegrityHash: null,
      latestCheckpointRemoteCursor: null,
    }),
    uploadCheckpoint: async (_generationId: string, value: typeof checkpoint) => {
      uploaded.push(value);
      return {
        checkpointId: value.checkpointId,
        acknowledgedThroughSequence: value.throughSequence,
        integrityHash: value.integrityHash,
        replicatedThroughCursor: value.replicatedThroughCursor ?? 0,
      };
    },
  } satisfies ReplicationTransport;
  const result = await replicatePersistenceProvider(harness.provider, transport, { uploadCheckpoint: true });
  assert.equal(result.checkpointUploaded, true);
  assert.equal(result.integrityVerified, true);
  assert.equal((uploaded[0] as typeof checkpoint).replicatedThroughCursor, 7);
}

{
  let cursorState: ReplicationCursorState = {
    generationId: "local-generation",
    pushedLocalSequence: 9,
    pulledRemoteCursor: 4,
  };
  let checkpointRequested = 0;
  const harness = createHarness(checkpoint.integrityHash);
  harness.provider.replicationStore.getReplicationCursorState = async () => cursorState;
  harness.provider.replicationStore.setReplicationCursorState = async (next: ReplicationCursorState) => {
    cursorState = next;
  };
  const transport = {
    ...harness.transport,
    getGeneration: async () => ({
      protocolVersion: 2 as const,
      generationId: "empty-remote-generation",
      latestCursor: 0,
      latestCheckpointId: null,
      latestCheckpointIntegrityHash: null,
      latestCheckpointRemoteCursor: null,
    }),
    getLatestCheckpoint: async () => {
      checkpointRequested += 1;
      return null;
    },
    pullOperations: async () => ({
      generationId: "empty-remote-generation",
      operations: [],
      latestCursor: 0,
      hasMore: false,
    }),
    uploadCheckpoint: async (_generationId: string, value: typeof checkpoint) => ({
      checkpointId: value.checkpointId,
      acknowledgedThroughSequence: value.throughSequence,
      integrityHash: value.integrityHash,
      replicatedThroughCursor: value.replicatedThroughCursor ?? 0,
    }),
  } satisfies ReplicationTransport;

  const result = await replicatePersistenceProvider(harness.provider, transport);
  assert.equal(checkpointRequested, 1);
  assert.equal(result.checkpointUploaded, true);
  assert.deepEqual(cursorState, {
    generationId: "empty-remote-generation",
    pushedLocalSequence: 0,
    pulledRemoteCursor: 0,
  });
}

console.log("v520 sync state integrity: pass");
