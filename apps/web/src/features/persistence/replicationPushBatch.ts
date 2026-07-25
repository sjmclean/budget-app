import { REPLICATION_PROTOCOL_VERSION } from "./replication";
import type { OperationJournalEntry } from "./operationJournal";

export const DEFAULT_REPLICATION_PUSH_TARGET_BYTES = 8 * 1024 * 1024;
export const DEFAULT_REPLICATION_PUSH_MAXIMUM_BYTES = 48 * 1024 * 1024;

export interface ReplicationPushBatch {
  readonly operations: readonly OperationJournalEntry[];
  readonly payloadBytes: number;
  readonly exceedsTargetBytes: boolean;
}

export interface ReplicationPushBatchOptions {
  readonly targetPayloadBytes?: number;
  readonly maximumPayloadBytes?: number;
}

/**
 * Selects the largest ordered prefix that fits the target request size.
 *
 * A single operation may exceed the target because whole-document journal
 * entries can legitimately be several megabytes. Such an operation is sent as
 * a singleton as long as the complete request remains below the hard maximum.
 */
export function selectReplicationPushBatch(
  generationId: string,
  operations: readonly OperationJournalEntry[],
  options: ReplicationPushBatchOptions = {},
): ReplicationPushBatch {
  if (operations.length === 0) {
    throw new Error("Replication push batches require at least one operation.");
  }

  const targetPayloadBytes = normaliseByteLimit(
    options.targetPayloadBytes ?? DEFAULT_REPLICATION_PUSH_TARGET_BYTES,
    "target payload",
  );
  const maximumPayloadBytes = normaliseByteLimit(
    options.maximumPayloadBytes ?? DEFAULT_REPLICATION_PUSH_MAXIMUM_BYTES,
    "maximum payload",
  );
  if (targetPayloadBytes > maximumPayloadBytes) {
    throw new Error("Replication push target payload bytes cannot exceed the maximum payload bytes.");
  }

  let selected: readonly OperationJournalEntry[] = [operations[0]!];
  let payloadBytes = measureReplicationPushPayloadBytes(generationId, selected);
  if (payloadBytes > maximumPayloadBytes) {
    throw new Error(
      `Replication operation ${operations[0]!.operationId} requires a ${payloadBytes} byte request, ` +
        `which exceeds the ${maximumPayloadBytes} byte client safety limit.`,
    );
  }

  for (let index = 1; index < operations.length; index += 1) {
    const candidate = operations.slice(0, index + 1);
    const candidateBytes = measureReplicationPushPayloadBytes(generationId, candidate);
    if (candidateBytes > targetPayloadBytes) break;
    selected = candidate;
    payloadBytes = candidateBytes;
  }

  return {
    operations: selected,
    payloadBytes,
    exceedsTargetBytes: payloadBytes > targetPayloadBytes,
  };
}

export function serialiseReplicationPushPayload(
  generationId: string,
  operations: readonly OperationJournalEntry[],
): string {
  return JSON.stringify({
    protocolVersion: REPLICATION_PROTOCOL_VERSION,
    generationId,
    operations,
  });
}

export function measureReplicationPushPayloadBytes(
  generationId: string,
  operations: readonly OperationJournalEntry[],
): number {
  return new TextEncoder().encode(serialiseReplicationPushPayload(generationId, operations)).byteLength;
}

function normaliseByteLimit(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1024) {
    throw new Error(`Replication push ${label} bytes must be an integer of at least 1024.`);
  }
  return value;
}
