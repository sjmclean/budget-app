import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";
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
      await provider.replicationStore.applyRemoteOperations(result.operations);
      pulledOperationCount += result.operations.length;
      pulledRemoteCursor = result.operations.at(-1)!.cursor;
      state = { ...state, pulledRemoteCursor };
      await provider.replicationStore.setReplicationCursorState(state);
    }
    if (!result.hasMore || result.operations.length === 0) break;
  }

  let checkpointUploaded = false;
  if (options.uploadCheckpoint && provider.checkpoints) {
    const checkpoint = await provider.checkpoints.createCheckpoint();
    await transport.uploadCheckpoint(remote.generationId, checkpoint);
    checkpointUploaded = true;
  }

  const journalCursor = provider.operationJournal.getJournalCursor();
  return {
    generationId: remote.generationId,
    pushedOperationCount,
    pulledOperationCount,
    finalLocalSequence: journalCursor.latestSequence,
    finalRemoteCursor: pulledRemoteCursor,
    checkpointUploaded,
  };
}

function normaliseBatchSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 5000) {
    throw new Error("Replication batch sizes must be integers between 1 and 5000.");
  }
  return value;
}
