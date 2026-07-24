import type { OperationJournalMutation } from "./operationJournal";

export type ReplicationConflictStatus = "unresolved" | "resolved-local" | "resolved-remote";

export interface ReplicationConflict {
  readonly conflictId: string;
  readonly generationId: string;
  readonly key: string;
  readonly detectedAt: string;
  readonly localOperationId: string;
  readonly localDeviceId: string;
  readonly localSequence: number;
  readonly localMutation: OperationJournalMutation;
  readonly remoteOperationId: string;
  readonly remoteDeviceId: string;
  readonly remoteCursor: number;
  readonly remoteMutation: OperationJournalMutation;
  readonly deterministicWinner: "remote";
  readonly status: ReplicationConflictStatus;
  readonly resolvedAt: string | null;
}

export interface ConflictResolutionPort {
  listConflicts(options?: { status?: ReplicationConflictStatus; limit?: number }): Promise<ReplicationConflict[]>;
  resolveConflict(conflictId: string, resolution: "keep-local" | "accept-remote"): Promise<void>;
}

export function mutationKey(mutation: OperationJournalMutation): string {
  return mutation.key;
}

export function mutationsAreEquivalent(
  left: OperationJournalMutation,
  right: OperationJournalMutation,
): boolean {
  if (left.type !== right.type || left.key !== right.key) return false;
  return left.type === "key-value.remove" || left.value === (right as Extract<OperationJournalMutation, { type: "key-value.set" }>).value;
}

export function createConflictId(input: {
  generationId: string;
  key: string;
  localOperationId: string;
  remoteOperationId: string;
}): string {
  return [input.generationId, input.key, input.localOperationId, input.remoteOperationId]
    .map((part) => encodeURIComponent(part))
    .join("|");
}
