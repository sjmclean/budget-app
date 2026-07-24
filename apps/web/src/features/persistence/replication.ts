import type { PersistenceCheckpoint } from "./checkpoint";
import type { OperationJournalEntry } from "./operationJournal";

export const REPLICATION_PROTOCOL_VERSION = 1 as const;

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

export interface ReplicationLocalStorePort {
  getReplicationCursorState(): Promise<ReplicationCursorState>;
  setReplicationCursorState(state: ReplicationCursorState): Promise<void>;
  applyRemoteOperations(operations: readonly RemoteOperationEnvelope[]): Promise<number>;
}

export interface ReplicationRemoteGeneration {
  readonly protocolVersion: typeof REPLICATION_PROTOCOL_VERSION;
  readonly generationId: string;
  readonly latestCursor: number;
  readonly latestCheckpointId: string | null;
}

export interface ReplicationPushResult {
  readonly generationId: string;
  readonly acceptedCount: number;
  readonly latestCursor: number;
}

export interface ReplicationPullResult {
  readonly generationId: string;
  readonly operations: readonly RemoteOperationEnvelope[];
  readonly latestCursor: number;
  readonly hasMore: boolean;
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
  uploadCheckpoint(generationId: string, checkpoint: PersistenceCheckpoint): Promise<void>;
  getLatestCheckpoint(generationId: string): Promise<PersistenceCheckpoint | null>;
}

export interface ReplicationRunResult {
  readonly generationId: string;
  readonly pushedOperationCount: number;
  readonly pulledOperationCount: number;
  readonly finalLocalSequence: number;
  readonly finalRemoteCursor: number;
  readonly checkpointUploaded: boolean;
}
