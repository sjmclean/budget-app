import assert from "node:assert/strict";
import {
  measureReplicationPushPayloadBytes,
  selectReplicationPushBatch,
} from "../apps/web/src/features/persistence/replicationPushBatch";
import {
  readLatestJournalOperationsForKeys,
  replicatePersistenceProvider,
} from "../apps/web/src/features/persistence/replicationEngine";
import type { OperationJournalEntry } from "../apps/web/src/features/persistence/operationJournal";
import type { ReplicationCursorState, ReplicationTransport } from "../apps/web/src/features/persistence/replication";
import type { BudgetPersistenceProvider } from "../apps/web/src/features/persistence/budgetPersistenceProvider";

const generationId = "generation-test";

function operation(sequence: number, valueBytes: number): OperationJournalEntry {
  return {
    formatVersion: 1,
    operationId: `operation-${sequence}`,
    deviceId: "device-test",
    sequence,
    recordedAt: "2026-07-25T00:00:00.000Z",
    mutation: {
      type: "key-value.set",
      key: `key-${sequence}`,
      value: "x".repeat(valueBytes),
    },
  };
}

const selection = selectReplicationPushBatch(
  generationId,
  [operation(1, 700_000), operation(2, 700_000), operation(3, 700_000)],
  { targetPayloadBytes: 1_500_000, maximumPayloadBytes: 5_000_000 },
);
assert.equal(selection.operations.length, 2);
assert.equal(
  selection.payloadBytes,
  measureReplicationPushPayloadBytes(generationId, selection.operations),
);

const largeSingleton = selectReplicationPushBatch(
  generationId,
  [operation(1, 2_000_000), operation(2, 10)],
  { targetPayloadBytes: 1_000_000, maximumPayloadBytes: 3_000_000 },
);
assert.equal(largeSingleton.operations.length, 1);
assert.equal(largeSingleton.exceedsTargetBytes, true);

assert.throws(
  () => selectReplicationPushBatch(
    generationId,
    [operation(1, 2_000_000)],
    { targetPayloadBytes: 1_000_000, maximumPayloadBytes: 1_500_000 },
  ),
  /client safety limit/,
);

const operations = Array.from({ length: 6 }, (_, index) => operation(index + 1, 700_000));
let cursorState: ReplicationCursorState = {
  generationId,
  pushedLocalSequence: 0,
  pulledRemoteCursor: 0,
};
const persistedPushCursors: number[] = [];
const submittedBatches: OperationJournalEntry[][] = [];

const provider = {
  flush: async () => undefined,
  operationJournal: {
    getJournalCursor: () => ({ deviceId: "device-test", latestSequence: operations.length }),
    readJournal: async (afterSequence = 0, limit = 500) =>
      operations.filter((entry) => entry.sequence > afterSequence).slice(0, limit),
  },
  replicationStore: {
    getReplicationCursorState: async () => cursorState,
    setReplicationCursorState: async (next: ReplicationCursorState) => {
      cursorState = next;
      persistedPushCursors.push(next.pushedLocalSequence);
    },
    applyRemoteOperations: async () => 0,
    getReplicationDiagnostics: async () => ({
      deviceId: "device-test",
      latestLocalSequence: operations.length,
      retainedJournalEntryCount: operations.length,
      oldestRetainedSequence: 1,
      latestCheckpointId: null,
      checkpointCount: 0,
      generationId,
      pushedLocalSequence: cursorState.pushedLocalSequence,
      pulledRemoteCursor: cursorState.pulledRemoteCursor,
      unresolvedConflictCount: 0,
    }),
    pruneJournal: async () => 0,
    listConflicts: async () => [],
    resolveConflict: async () => undefined,
  },
} as unknown as BudgetPersistenceProvider;

const transport = {
  getGeneration: async () => ({
    protocolVersion: 2 as const,
    generationId,
    latestCursor: 0,
    latestCheckpointId: null,
  }),
  pushOperations: async (_generationId: string, batch: readonly OperationJournalEntry[]) => {
    submittedBatches.push([...batch]);
    return {
      generationId,
      acceptedCount: batch.length,
      acknowledgedCount: batch.length,
      latestCursor: batch.at(-1)!.sequence,
    };
  },
  pullOperations: async () => ({
    generationId,
    operations: [],
    latestCursor: 0,
    hasMore: false,
  }),
  uploadCheckpoint: async () => ({ checkpointId: "unused", acknowledgedThroughSequence: 0 }),
  getLatestCheckpoint: async () => null,
  hasBlob: async () => false,
  uploadBlob: async () => undefined,
  downloadBlob: async () => null,
} satisfies ReplicationTransport;

await replicatePersistenceProvider(provider, transport, {
  batchSize: 500,
  pushTargetPayloadBytes: 1_500_000,
  pushMaximumPayloadBytes: 5_000_000,
});

assert.deepEqual(submittedBatches.map((batch) => batch.length), [2, 2, 2]);
assert.deepEqual(persistedPushCursors.slice(-3), [2, 4, 6]);
assert.equal(cursorState.pushedLocalSequence, 6);
for (const batch of submittedBatches) {
  assert.ok(measureReplicationPushPayloadBytes(generationId, batch) <= 1_500_000);
}

const largeJournal = Array.from(
  { length: 10_000 },
  (_, index) => operation(index + 1, 16),
);
const relevantOperations = await readLatestJournalOperationsForKeys(
  {
    getJournalCursor: () => ({
      deviceId: "device-test",
      latestSequence: largeJournal.length,
    }),
    readJournal: async (afterSequence = 0, limit = 500) =>
      largeJournal
        .filter((entry) => entry.sequence > afterSequence)
        .slice(0, limit),
  },
  0,
  500,
  new Set(["key-9999"]),
);
assert.deepEqual(
  relevantOperations.map((entry) => entry.mutation.key),
  ["key-9999"],
  "conflict preparation must not retain unrelated imported transaction values",
);

console.log("v492 replication byte-aware push validation passed.");
