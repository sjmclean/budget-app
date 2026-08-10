import assert from "node:assert/strict";
import {
  MemoryAttachmentContentStore,
  calculateAttachmentContentHash,
  setAttachmentContentStoreForTests,
} from "../apps/web/src/features/attachments/attachmentContentStore";
import { replicatePersistenceProvider } from
  "../apps/web/src/features/persistence/replicationEngine";
import type {
  ReplicationCursorState,
  ReplicationTransport,
} from "../apps/web/src/features/persistence/replication";

const bytesA = new TextEncoder().encode("attachment for budget a");
const bytesB = new TextEncoder().encode("attachment for budget b");
const hashA = await calculateAttachmentContentHash(bytesA);
const hashB = await calculateAttachmentContentHash(bytesB);

function attachmentValue(id: string, contentHash: string, fileSize: number) {
  return JSON.stringify({
    id,
    contentHash,
    fileSize,
    mimeType: "text/plain",
  });
}

function provider(entries: Record<string, string>) {
  let cursor: ReplicationCursorState = {
    generationId: null,
    pushedLocalSequence: 0,
    pulledRemoteCursor: 0,
  };
  return {
    flush: async () => undefined,
    exportSnapshot: async () => ({ formatVersion: 1, entries }),
    operationJournal: {
      getJournalCursor: () => ({ latestSequence: 0 }),
      readJournal: async () => [],
    },
    replicationStore: {
      getReplicationCursorState: async () => cursor,
      setReplicationCursorState: async (next: ReplicationCursorState) => {
        cursor = next;
      },
      applyRemoteOperations: async () => 0,
      pruneJournal: async () => 0,
      getReplicationDiagnostics: async () => ({
        deviceId: "device",
        latestLocalSequence: 0,
        retainedJournalEntryCount: 0,
        oldestRetainedSequence: null,
        latestCheckpointId: null,
        checkpointCount: 0,
        generationId: cursor.generationId,
        pushedLocalSequence: cursor.pushedLocalSequence,
        pulledRemoteCursor: cursor.pulledRemoteCursor,
        unresolvedConflictCount: 0,
      }),
    },
  } as any;
}

function transport(input: {
  uploads?: string[];
  download?: (hash: string) => Blob | null;
}): ReplicationTransport {
  return {
    getGeneration: async () => ({
      protocolVersion: 2,
      generationId: "generation-a",
      latestCursor: 0,
      latestCheckpointId: null,
    }),
    pushOperations: async () => ({
      generationId: "generation-a",
      acceptedCount: 0,
      acknowledgedCount: 0,
      latestCursor: 0,
    }),
    pullOperations: async () => ({
      generationId: "generation-a",
      operations: [],
      latestCursor: 0,
      hasMore: false,
    }),
    uploadCheckpoint: async () => ({
      checkpointId: "unused",
      acknowledgedThroughSequence: 0,
    }),
    getLatestCheckpoint: async () => null,
    hasBlob: async () => false,
    uploadBlob: async (_generation, descriptor) => {
      input.uploads?.push(descriptor.contentHash);
    },
    downloadBlob: async (_generation, hash) => input.download?.(hash) ?? null,
  };
}

const uploadStore = new MemoryAttachmentContentStore();
await uploadStore.put({
  attachmentId: "attachment-a",
  bytes: bytesA,
  mimeType: "text/plain",
  contentHash: hashA,
});
await uploadStore.put({
  attachmentId: "attachment-b",
  bytes: bytesB,
  mimeType: "text/plain",
  contentHash: hashB,
});
setAttachmentContentStoreForTests(uploadStore);
const uploads: string[] = [];
await replicatePersistenceProvider(
  provider({
    "budget-app.budgets.budget-a.budget-app.entity-replication.v1/transaction/a":
      attachmentValue("attachment-a", hashA, bytesA.byteLength),
    "budget-app.budgets.budget-b.budget-app.entity-replication.v1/transaction/b":
      attachmentValue("attachment-b", hashB, bytesB.byteLength),
  }),
  transport({ uploads }),
  { budgetId: "budget-a" },
);
assert.deepEqual(uploads, [hashA]);

const downloadStore = new MemoryAttachmentContentStore();
setAttachmentContentStoreForTests(downloadStore);
await replicatePersistenceProvider(
  provider({
    "budget-app.budgets.budget-a.budget-app.entity-replication.v1/transaction/a":
      attachmentValue("attachment-a", hashA, bytesA.byteLength),
  }),
  transport({
    download: (hash) =>
      hash === hashA ? new Blob([bytesA], { type: "text/plain" }) : null,
  }),
  { budgetId: "budget-a" },
);
assert.equal(await downloadStore.existsByHash(hashA), true);
assert.equal(await downloadStore.existsByHash(hashB), false);

setAttachmentContentStoreForTests(null);
console.log("Milestone 3 budget-scoped attachment replication passed.");
