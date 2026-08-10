import type { PersistenceCheckpoint } from "./checkpoint";
import type { OperationJournalEntry } from "./operationJournal";
import type { ConflictResolutionPort } from "./conflictResolution";

export const REPLICATION_PROTOCOL_VERSION = 2 as const;

export interface ReplicationCursorState {
  readonly generationId: string | null;
  readonly pushedLocalSequence: number;
  readonly pulledRemoteCursor: number;
}

export interface RemoteOperationEnvelope {
  readonly cursor: number;
  readonly generationId: string;
  readonly operation: OperationJournalEntry;
  readonly receivedAt: string;
}

export interface ReplicationDiagnostics {
  readonly deviceId: string;
  readonly latestLocalSequence: number;
  readonly retainedJournalEntryCount: number;
  readonly oldestRetainedSequence: number | null;
  readonly latestCheckpointId: string | null;
  readonly checkpointCount: number;
  readonly generationId: string | null;
  readonly pushedLocalSequence: number;
  readonly pulledRemoteCursor: number;
  readonly unresolvedConflictCount: number;
}

export interface ReplicationApplyContext {
  readonly generationId: string;
  readonly localOperations: readonly OperationJournalEntry[];
}

export interface ReplicationLocalStorePort extends ConflictResolutionPort {
  getReplicationCursorState(scope?: string): Promise<ReplicationCursorState>;
  setReplicationCursorState(state: ReplicationCursorState, scope?: string): Promise<void>;
  applyRemoteOperations(
    operations: readonly RemoteOperationEnvelope[],
    context?: ReplicationApplyContext,
  ): Promise<number>;
  getReplicationDiagnostics(scope?: string): Promise<ReplicationDiagnostics>;
  pruneJournal(throughSequence: number, scope?: string): Promise<number>;
}

export interface ReplicationRemoteGeneration {
  readonly protocolVersion: typeof REPLICATION_PROTOCOL_VERSION;
  readonly generationId: string;
  readonly latestCursor: number;
  readonly latestCheckpointId: string | null;
  readonly latestCheckpointIntegrityHash?: string | null;
  readonly latestCheckpointRemoteCursor?: number | null;
}

export interface ReplicationPushResult {
  readonly generationId: string;
  readonly acceptedCount: number;
  readonly acknowledgedCount?: number;
  readonly latestCursor: number;
}

export interface ReplicationPullResult {
  readonly generationId: string;
  readonly operations: readonly RemoteOperationEnvelope[];
  readonly latestCursor: number;
  readonly hasMore: boolean;
}

export interface ReplicationBlobDescriptor {
  readonly contentHash: string;
  readonly mimeType: string;
  readonly size: number;
}

export interface ReplicationTransport {
  getGeneration(): Promise<ReplicationRemoteGeneration>;
  pushOperations(
    generationId: string,
    operations: readonly OperationJournalEntry[],
  ): Promise<ReplicationPushResult>;
  pullOperations(
    generationId: string,
    afterCursor: number,
    limit?: number,
  ): Promise<ReplicationPullResult>;
  uploadCheckpoint(generationId: string, checkpoint: PersistenceCheckpoint): Promise<ReplicationCheckpointUploadResult>;
  getLatestCheckpoint(generationId: string): Promise<PersistenceCheckpoint | null>;
  hasBlob(generationId: string, contentHash: string): Promise<boolean>;
  uploadBlob(
    generationId: string,
    descriptor: ReplicationBlobDescriptor,
    content: Blob,
  ): Promise<void>;
  downloadBlob(generationId: string, contentHash: string): Promise<Blob | null>;
}

export interface ReplicationCheckpointUploadResult {
  readonly checkpointId: string;
  readonly acknowledgedThroughSequence: number;
  readonly integrityHash?: string;
  readonly replicatedThroughCursor?: number;
}

export interface ReplicationRunResult {
  readonly generationId: string;
  readonly pushedOperationCount: number;
  readonly pulledOperationCount: number;
  readonly finalLocalSequence: number;
  readonly finalRemoteCursor: number;
  readonly checkpointUploaded: boolean;
  readonly uploadedBlobCount: number;
  readonly downloadedBlobCount: number;
  readonly prunedJournalEntryCount: number;
  readonly detectedConflictCount: number;
  readonly integrityVerified: boolean;
  readonly integrityRepairPerformed: boolean;
}
