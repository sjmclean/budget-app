import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";
import {
  getAttachmentContentStore,
  calculateAttachmentContentHash,
} from "../attachments/attachmentContentStore";
import type {
  ReplicationRunResult,
  ReplicationTransport,
} from "./replication";

export interface ReplicationEngineOptions {
  readonly batchSize?: number;
  readonly uploadCheckpoint?: boolean;
}

export async function replicatePersistenceProvider(
  provider: BudgetPersistenceProvider,
  transport: ReplicationTransport,
  options: ReplicationEngineOptions = {},
): Promise<ReplicationRunResult> {
  if (!provider.operationJournal || !provider.replicationStore) {
    throw new Error("The configured persistence provider does not support replication.");
  }

  await provider.flush?.();
  const batchSize = normaliseBatchSize(options.batchSize ?? 500);
  const remote = await transport.getGeneration();
  let state = await provider.replicationStore.getReplicationCursorState();

  if (state.generationId && state.generationId !== remote.generationId) {
    const checkpoint = await transport.getLatestCheckpoint(remote.generationId);
    if (!checkpoint || !provider.checkpoints) {
      throw new Error(
        "The remote replication generation changed and no restorable checkpoint is available.",
      );
    }
    await provider.checkpoints.restoreCheckpoint(checkpoint);
    state = {
      generationId: remote.generationId,
      pushedLocalSequence: 0,
      pulledRemoteCursor: 0,
    };
    await provider.replicationStore.setReplicationCursorState(state);
  } else if (!state.generationId) {
    state = { ...state, generationId: remote.generationId };
    await provider.replicationStore.setReplicationCursorState(state);
  }

  const uploadedBlobCount = await uploadLocalAttachmentBlobs(
    transport,
    remote.generationId,
  );

  const localOperationsParticipating = await readAllJournalOperations(
    provider.operationJournal,
    state.pushedLocalSequence,
    batchSize,
  );

  let pushedOperationCount = 0;
  let pushedLocalSequence = state.pushedLocalSequence;
  while (true) {
    const operations = await provider.operationJournal.readJournal(
      pushedLocalSequence,
      batchSize,
    );
    if (operations.length === 0) break;
    await transport.pushOperations(remote.generationId, operations);
    pushedLocalSequence = operations.at(-1)!.sequence;
    pushedOperationCount += operations.length;
    state = { ...state, pushedLocalSequence };
    await provider.replicationStore.setReplicationCursorState(state);
    if (operations.length < batchSize) break;
  }

  let pulledOperationCount = 0;
  let pulledRemoteCursor = state.pulledRemoteCursor;
  while (true) {
    const result = await transport.pullOperations(
      remote.generationId,
      pulledRemoteCursor,
      batchSize,
    );
    if (result.operations.length > 0) {
      await provider.replicationStore.applyRemoteOperations(result.operations, {
        generationId: remote.generationId,
        localOperations: localOperationsParticipating,
      });
      pulledOperationCount += result.operations.length;
      pulledRemoteCursor = result.operations.at(-1)!.cursor;
      state = { ...state, pulledRemoteCursor };
      await provider.replicationStore.setReplicationCursorState(state);
    }
    if (!result.hasMore || result.operations.length === 0) break;
  }

  const downloadedBlobCount = await downloadReferencedAttachmentBlobs(
    provider,
    transport,
    remote.generationId,
  );

  let checkpointUploaded = false;
  let prunedJournalEntryCount = 0;
  if (options.uploadCheckpoint && provider.checkpoints) {
    const checkpoint = await provider.checkpoints.createCheckpoint();
    const acknowledgement = await transport.uploadCheckpoint(remote.generationId, checkpoint);
    if (acknowledgement.checkpointId !== checkpoint.checkpointId) {
      throw new Error("The server acknowledged a different checkpoint than the one uploaded.");
    }
    const safeBoundary = Math.min(
      acknowledgement.acknowledgedThroughSequence,
      checkpoint.throughSequence,
      pushedLocalSequence,
    );
    prunedJournalEntryCount = await provider.replicationStore.pruneJournal(safeBoundary);
    checkpointUploaded = true;
  }

  const journalCursor = provider.operationJournal.getJournalCursor();
  const diagnostics = await provider.replicationStore.getReplicationDiagnostics();
  return {
    generationId: remote.generationId,
    pushedOperationCount,
    pulledOperationCount,
    finalLocalSequence: journalCursor.latestSequence,
    finalRemoteCursor: pulledRemoteCursor,
    checkpointUploaded,
    uploadedBlobCount,
    downloadedBlobCount,
    prunedJournalEntryCount,
    detectedConflictCount: diagnostics.unresolvedConflictCount,
  };
}


async function readAllJournalOperations(
  journal: NonNullable<BudgetPersistenceProvider["operationJournal"]>,
  afterSequence: number,
  batchSize: number,
): Promise<import("./operationJournal").OperationJournalEntry[]> {
  const result: import("./operationJournal").OperationJournalEntry[] = [];
  let cursor = afterSequence;
  while (true) {
    const batch = await journal.readJournal(cursor, batchSize);
    if (batch.length === 0) break;
    result.push(...batch);
    cursor = batch.at(-1)!.sequence;
    if (batch.length < batchSize) break;
  }
  return result;
}

function normaliseBatchSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 5000) {
    throw new Error("Replication batch sizes must be integers between 1 and 5000.");
  }
  return value;
}


interface AttachmentReference {
  readonly attachmentId: string;
  readonly contentHash: string;
  readonly mimeType: string;
  readonly fileSize: number;
}

async function uploadLocalAttachmentBlobs(
  transport: ReplicationTransport,
  generationId: string,
): Promise<number> {
  const contentStore = getAttachmentContentStore();
  let uploadedBlobCount = 0;
  for (const descriptor of await contentStore.list()) {
    if (!isCanonicalContentHash(descriptor.contentHash)) continue;
    if (await transport.hasBlob(generationId, descriptor.contentHash)) continue;
    const content = await contentStore.read(descriptor.contentRef);
    if (!content) continue;
    await transport.uploadBlob(generationId, {
      contentHash: descriptor.contentHash,
      mimeType: descriptor.mimeType,
      size: descriptor.size,
    }, content);
    uploadedBlobCount += 1;
  }
  return uploadedBlobCount;
}

async function downloadReferencedAttachmentBlobs(
  provider: BudgetPersistenceProvider,
  transport: ReplicationTransport,
  generationId: string,
): Promise<number> {
  const snapshot = await provider.exportSnapshot?.();
  if (!snapshot) return 0;
  const contentStore = getAttachmentContentStore();
  const references = collectAttachmentReferences(snapshot.entries);
  let downloadedBlobCount = 0;
  for (const reference of references.values()) {
    if (!isCanonicalContentHash(reference.contentHash)) continue;
    if (await contentStore.existsByHash(reference.contentHash)) continue;
    const content = await transport.downloadBlob(generationId, reference.contentHash);
    if (!content) continue;
    const bytes = new Uint8Array(await content.arrayBuffer());
    const actualHash = await calculateAttachmentContentHash(bytes);
    if (actualHash !== reference.contentHash) {
      throw new Error(`Downloaded attachment ${reference.contentHash} failed integrity verification.`);
    }
    await contentStore.put({
      attachmentId: reference.attachmentId,
      bytes,
      mimeType: reference.mimeType || content.type || "application/octet-stream",
      contentHash: reference.contentHash,
    });
    downloadedBlobCount += 1;
  }
  return downloadedBlobCount;
}

function collectAttachmentReferences(
  entries: Readonly<Record<string, string>>,
): Map<string, AttachmentReference> {
  const result = new Map<string, AttachmentReference>();
  for (const value of Object.values(entries)) {
    try {
      visit(JSON.parse(value));
    } catch {
      // Non-JSON canonical values cannot contain attachment metadata.
    }
  }
  return result;

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (
      typeof record.id === "string" &&
      typeof record.contentHash === "string" &&
      typeof record.fileSize === "number" &&
      typeof record.mimeType === "string"
    ) {
      result.set(record.contentHash, {
        attachmentId: record.id,
        contentHash: record.contentHash,
        mimeType: record.mimeType,
        fileSize: record.fileSize,
      });
    }
    for (const child of Object.values(record)) visit(child);
  }
}

function isCanonicalContentHash(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}
