import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";
import { createPersistenceCheckpoint } from "./checkpoint";
import { publishPersistenceChange } from "./persistenceChangeBus";
import {
  getAttachmentContentStore,
  calculateAttachmentContentHash,
} from "../attachments/attachmentContentStore";
import type {
  ReplicationRunResult,
  ReplicationTransport,
} from "./replication";
import type { OperationJournalEntry } from "./operationJournal";
import {
  DEFAULT_REPLICATION_PUSH_MAXIMUM_BYTES,
  DEFAULT_REPLICATION_PUSH_TARGET_BYTES,
  selectReplicationPushBatch,
} from "./replicationPushBatch";

export interface ReplicationEngineOptions {
  readonly budgetId?: string;
  readonly batchSize?: number;
  readonly pushTargetPayloadBytes?: number;
  readonly pushMaximumPayloadBytes?: number;
  readonly uploadCheckpoint?: boolean;
  /**
   * Optional diagnostic observer. Events contain operation metadata and storage
   * keys, but never mutation values, so production diagnostics can trace the
   * replication pipeline without exposing budget contents.
   */
  readonly onTrace?: (event: ReplicationTraceEvent) => void;
}

export type ReplicationTraceEvent =
  | { readonly type: "replication.started"; readonly generationId: string; readonly cursorState: { readonly pushedLocalSequence: number; readonly pulledRemoteCursor: number } }
  | { readonly type: "journal.operations-read"; readonly afterSequence: number; readonly operations: readonly ReplicationTraceOperation[] }
  | { readonly type: "push.batch-started"; readonly operations: readonly ReplicationTraceOperation[]; readonly payloadBytes: number; readonly exceedsTargetBytes: boolean }
  | { readonly type: "push.batch-finished"; readonly submittedCount: number; readonly acceptedCount: number; readonly latestCursor: number }
  | { readonly type: "push.cursor-persisted"; readonly pushedLocalSequence: number }
  | { readonly type: "pull.batch-finished"; readonly afterCursor: number; readonly operations: readonly ReplicationTraceRemoteOperation[]; readonly hasMore: boolean }
  | { readonly type: "pull.operations-applied"; readonly requestedCount: number; readonly appliedCount: number }
  | { readonly type: "pull.cursor-persisted"; readonly pulledRemoteCursor: number }
  | { readonly type: "replication.finished"; readonly pushedOperationCount: number; readonly pulledOperationCount: number; readonly finalLocalSequence: number; readonly finalRemoteCursor: number };

export interface ReplicationTraceOperation {
  readonly operationId: string;
  readonly deviceId: string;
  readonly sequence: number;
  readonly mutationType: OperationJournalEntry["mutation"]["type"];
  readonly key: string;
}

export interface ReplicationTraceRemoteOperation extends ReplicationTraceOperation {
  readonly cursor: number;
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
  const budgetPrefix = options.budgetId
    ? `budget-app.budgets.${options.budgetId}.`
    : null;
  let state = await provider.replicationStore.getReplicationCursorState(options.budgetId);
  // Seal any checkpoint-less generation after this device has completed its
  // push/pull pass. This also repairs a generation populated by an older
  // client that replayed operations but failed to publish the baseline.
  let bootstrapCheckpointRequired = remote.latestCheckpointId === null;

  if (state.generationId && state.generationId !== remote.generationId) {
    const checkpoint = await transport.getLatestCheckpoint(remote.generationId);
    if (checkpoint && provider.checkpoints) {
      await provider.checkpoints.restoreCheckpoint(checkpoint, [], options.budgetId);
      state = {
        generationId: remote.generationId,
        pushedLocalSequence: 0,
        pulledRemoteCursor: checkpoint.replicatedThroughCursor ?? 0,
      };
    } else if (remote.latestCursor === 0) {
      // A newly provisioned server generation has no checkpoint by definition.
      // Adopt it and replay the local journal from the beginning so the first
      // device can bootstrap the remote budget instead of retrying forever.
      state = {
        generationId: remote.generationId,
        pushedLocalSequence: 0,
        pulledRemoteCursor: 0,
      };
      bootstrapCheckpointRequired = true;
    } else {
      throw new Error(
        "The remote replication generation changed and no restorable checkpoint is available.",
      );
    }
    await provider.replicationStore.setReplicationCursorState(state, options.budgetId);
  } else if (!state.generationId) {
    state = { ...state, generationId: remote.generationId };
    await provider.replicationStore.setReplicationCursorState(state, options.budgetId);
  }
  const localConflictAfterSequence = state.pushedLocalSequence;

  trace(options, {
    type: "replication.started",
    generationId: remote.generationId,
    cursorState: {
      pushedLocalSequence: state.pushedLocalSequence,
      pulledRemoteCursor: state.pulledRemoteCursor,
    },
  });

  const uploadedBlobCount = await uploadLocalAttachmentBlobs(
    provider,
    transport,
    remote.generationId,
    budgetPrefix,
  );

  trace(options, {
    type: "journal.operations-read",
    afterSequence: state.pushedLocalSequence,
    operations: [],
  });

  let pushedOperationCount = 0;
  let pushedLocalSequence = state.pushedLocalSequence;
  while (true) {
    const journalOperations = await provider.operationJournal.readJournal(
      pushedLocalSequence,
      batchSize,
    );
    if (journalOperations.length === 0) break;
    const pendingOperations = budgetPrefix
      ? journalOperations.filter(({ mutation }) => mutation.key.startsWith(budgetPrefix))
      : journalOperations;
    if (pendingOperations.length === 0) {
      pushedLocalSequence = journalOperations.at(-1)!.sequence;
      state = { ...state, pushedLocalSequence };
      await provider.replicationStore.setReplicationCursorState(
        state,
        options.budgetId,
      );
      continue;
    }
    const batch = selectReplicationPushBatch(remote.generationId, pendingOperations, {
      targetPayloadBytes:
        options.pushTargetPayloadBytes ?? DEFAULT_REPLICATION_PUSH_TARGET_BYTES,
      maximumPayloadBytes:
        options.pushMaximumPayloadBytes ?? DEFAULT_REPLICATION_PUSH_MAXIMUM_BYTES,
    });
    const operations = batch.operations;
    trace(options, {
      type: "push.batch-started",
      operations: operations.map(summariseOperation),
      payloadBytes: batch.payloadBytes,
      exceedsTargetBytes: batch.exceedsTargetBytes,
    });
    const pushResult = await transport.pushOperations(remote.generationId, operations);
    const acknowledgedCount = pushResult.acknowledgedCount ??
      (pushResult.acceptedCount === operations.length ? operations.length : null);
    if (acknowledgedCount !== operations.length) {
      throw new Error(
        `The server acknowledged ${acknowledgedCount ?? 0} of ${operations.length} replication operations. ` +
          "The local push cursor was not advanced.",
      );
    }
    trace(options, {
      type: "push.batch-finished",
      submittedCount: operations.length,
      acceptedCount: pushResult.acceptedCount,
      latestCursor: pushResult.latestCursor,
    });
    pushedLocalSequence = operations.at(-1)!.sequence;
    pushedOperationCount += operations.length;
    state = { ...state, pushedLocalSequence };
    await provider.replicationStore.setReplicationCursorState(state, options.budgetId);
    trace(options, { type: "push.cursor-persisted", pushedLocalSequence });
    if (
      journalOperations.length < batchSize &&
      operations.length === pendingOperations.length
    ) break;
  }

  let pulledOperationCount = 0;
  let pulledRemoteCursor = state.pulledRemoteCursor;
  while (true) {
    const pullAfterCursor = pulledRemoteCursor;
    const result = await transport.pullOperations(
      remote.generationId,
      pulledRemoteCursor,
      batchSize,
    );
    trace(options, {
      type: "pull.batch-finished",
      afterCursor: pullAfterCursor,
      operations: result.operations.map((envelope) => ({
        cursor: envelope.cursor,
        ...summariseOperation(envelope.operation),
      })),
      hasMore: result.hasMore,
    });
    if (result.operations.length > 0) {
      const remoteKeys = new Set(
        result.operations.map((envelope) => envelope.operation.mutation.key),
      );
      const localOperationsParticipating =
        await readLatestJournalOperationsForKeys(
          provider.operationJournal,
          localConflictAfterSequence,
          batchSize,
          remoteKeys,
        );
      const appliedCount = await provider.replicationStore.applyRemoteOperations(result.operations, {
        generationId: remote.generationId,
        localOperations: localOperationsParticipating,
      });
      trace(options, {
        type: "pull.operations-applied",
        requestedCount: result.operations.length,
        appliedCount,
      });
      pulledOperationCount += result.operations.length;
      pulledRemoteCursor = result.operations.at(-1)!.cursor;
      state = { ...state, pulledRemoteCursor };
      await provider.replicationStore.setReplicationCursorState(state, options.budgetId);
      trace(options, { type: "pull.cursor-persisted", pulledRemoteCursor });
    }
    if (!result.hasMore || result.operations.length === 0) break;
  }

  const downloadedBlobCount = await downloadReferencedAttachmentBlobs(
    provider,
    transport,
    remote.generationId,
    budgetPrefix,
  );

  let integrityVerified = false;
  let integrityRepairPerformed = false;
  if (
    pushedOperationCount === 0 &&
    provider.checkpoints &&
    pulledRemoteCursor === remote.latestCursor &&
    remote.latestCheckpointIntegrityHash &&
    remote.latestCheckpointRemoteCursor === remote.latestCursor
  ) {
    const localIntegrityHash =
      await provider.checkpoints.calculateStateIntegrityHash(options.budgetId);
    if (localIntegrityHash === remote.latestCheckpointIntegrityHash) {
      integrityVerified = true;
    } else {
      const checkpoint = await transport.getLatestCheckpoint(remote.generationId);
      if (
        !checkpoint ||
        checkpoint.integrityHash !== remote.latestCheckpointIntegrityHash ||
        (checkpoint.replicatedThroughCursor ?? 0) !== remote.latestCursor
      ) {
        throw new Error("Replication state integrity mismatch could not be repaired from the advertised checkpoint.");
      }
      await provider.checkpoints.restoreCheckpoint(checkpoint, [], options.budgetId);
      state = {
        generationId: remote.generationId,
        pushedLocalSequence: 0,
        pulledRemoteCursor: checkpoint.replicatedThroughCursor ?? 0,
      };
      await provider.replicationStore.setReplicationCursorState(state, options.budgetId);
      pushedLocalSequence = 0;
      pulledRemoteCursor = checkpoint.replicatedThroughCursor ?? 0;
      integrityRepairPerformed = true;
      integrityVerified =
        (await provider.checkpoints.calculateStateIntegrityHash(options.budgetId)) ===
        checkpoint.integrityHash;
      if (!integrityVerified) {
        throw new Error("Replication checkpoint repair did not restore the advertised state integrity hash.");
      }
    }
  }

  if (pulledOperationCount > 0 || integrityRepairPerformed) {
    publishPersistenceChange({ source: "replication" });
  }

  let checkpointUploaded = false;
  let prunedJournalEntryCount = 0;
  if ((options.uploadCheckpoint || bootstrapCheckpointRequired) && provider.checkpoints) {
    const createdCheckpoint =
      await provider.checkpoints.createCheckpoint(options.budgetId);
    const checkpoint = createPersistenceCheckpoint({
      checkpointId: createdCheckpoint.checkpointId,
      deviceId: createdCheckpoint.deviceId,
      throughSequence: createdCheckpoint.throughSequence,
      schemaVersion: createdCheckpoint.schemaVersion,
      createdAt: new Date(createdCheckpoint.createdAt),
      replicatedThroughCursor: pulledRemoteCursor,
      entries: createdCheckpoint.entries,
    });
    const acknowledgement = await transport.uploadCheckpoint(remote.generationId, checkpoint);
    if (acknowledgement.checkpointId !== checkpoint.checkpointId) {
      throw new Error("The server acknowledged a different checkpoint than the one uploaded.");
    }
    if (
      (acknowledgement.integrityHash ?? checkpoint.integrityHash) !== checkpoint.integrityHash ||
      (acknowledgement.replicatedThroughCursor ?? checkpoint.replicatedThroughCursor) !== checkpoint.replicatedThroughCursor
    ) {
      throw new Error("The server acknowledged checkpoint state metadata that differs from the uploaded checkpoint.");
    }
    integrityVerified = true;
    const safeBoundary = Math.min(
      acknowledgement.acknowledgedThroughSequence,
      checkpoint.throughSequence,
      pushedLocalSequence,
    );
    prunedJournalEntryCount =
      await provider.replicationStore.pruneJournal(safeBoundary, options.budgetId);
    checkpointUploaded = true;
  }

  const journalCursor = provider.operationJournal.getJournalCursor();
  const diagnostics = await provider.replicationStore.getReplicationDiagnostics(
    options.budgetId,
  );
  const result: ReplicationRunResult = {
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
    integrityVerified,
    integrityRepairPerformed,
  };
  trace(options, {
    type: "replication.finished",
    pushedOperationCount,
    pulledOperationCount,
    finalLocalSequence: result.finalLocalSequence,
    finalRemoteCursor: result.finalRemoteCursor,
  });
  return result;
}

function trace(options: ReplicationEngineOptions, event: ReplicationTraceEvent): void {
  options.onTrace?.(event);
}

function summariseOperation(operation: OperationJournalEntry): ReplicationTraceOperation {
  return {
    operationId: operation.operationId,
    deviceId: operation.deviceId,
    sequence: operation.sequence,
    mutationType: operation.mutation.type,
    key: operation.mutation.key,
  };
}


export async function readLatestJournalOperationsForKeys(
  journal: NonNullable<BudgetPersistenceProvider["operationJournal"]>,
  afterSequence: number,
  batchSize: number,
  keys: ReadonlySet<string>,
): Promise<OperationJournalEntry[]> {
  if (keys.size === 0) return [];
  const latestByKey = new Map<string, OperationJournalEntry>();
  let cursor = afterSequence;
  while (true) {
    const batch = await journal.readJournal(cursor, batchSize);
    if (batch.length === 0) break;
    for (const operation of batch) {
      if (keys.has(operation.mutation.key)) {
        latestByKey.set(operation.mutation.key, operation);
      }
    }
    cursor = batch.at(-1)!.sequence;
    if (batch.length < batchSize) break;
  }
  return [...latestByKey.values()].sort((left, right) => left.sequence - right.sequence);
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
  provider: BudgetPersistenceProvider,
  transport: ReplicationTransport,
  generationId: string,
  budgetPrefix: string | null = null,
): Promise<number> {
  const contentStore = getAttachmentContentStore();
  const snapshot = budgetPrefix ? await provider.exportSnapshot?.() : null;
  const referencedHashes = budgetPrefix
    ? snapshot
      ? collectAttachmentReferences(filterEntries(snapshot.entries, budgetPrefix))
      : new Map<string, AttachmentReference>()
    : null;
  let uploadedBlobCount = 0;
  for (const descriptor of await contentStore.list()) {
    if (!isCanonicalContentHash(descriptor.contentHash)) continue;
    if (referencedHashes && !referencedHashes.has(descriptor.contentHash)) continue;
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
  budgetPrefix: string | null = null,
): Promise<number> {
  const snapshot = await provider.exportSnapshot?.();
  if (!snapshot) return 0;
  const contentStore = getAttachmentContentStore();
  const references = collectAttachmentReferences(
    filterEntries(snapshot.entries, budgetPrefix),
  );
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

function filterEntries(
  entries: Readonly<Record<string, string>>,
  budgetPrefix: string | null,
): Readonly<Record<string, string>> {
  if (!budgetPrefix) return entries;
  return Object.fromEntries(
    Object.entries(entries).filter(([key]) => key.startsWith(budgetPrefix)),
  );
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
