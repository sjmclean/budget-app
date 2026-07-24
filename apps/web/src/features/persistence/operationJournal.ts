export const OPERATION_JOURNAL_FORMAT_VERSION = 1 as const;

export type OperationJournalMutation =
  | {
      readonly type: "key-value.set";
      readonly key: string;
      readonly value: string;
    }
  | {
      readonly type: "key-value.remove";
      readonly key: string;
    };

export interface OperationJournalEntry {
  readonly formatVersion: typeof OPERATION_JOURNAL_FORMAT_VERSION;
  readonly operationId: string;
  readonly deviceId: string;
  readonly sequence: number;
  readonly recordedAt: string;
  readonly mutation: OperationJournalMutation;
}

export interface OperationJournalPort {
  getJournalCursor(): OperationJournalCursor;
  readJournal(afterSequence?: number, limit?: number): Promise<OperationJournalEntry[]>;
}

export interface OperationJournalCursor {
  readonly deviceId: string;
  readonly latestSequence: number;
}

export function createOperationJournalEntry(input: {
  readonly deviceId: string;
  readonly sequence: number;
  readonly mutation: OperationJournalMutation;
  readonly now?: Date;
  readonly operationId?: string;
}): OperationJournalEntry {
  if (!input.deviceId.trim()) {
    throw new Error("Operation journal entries require a device ID.");
  }
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) {
    throw new Error("Operation journal sequence numbers must be positive integers.");
  }

  return {
    formatVersion: OPERATION_JOURNAL_FORMAT_VERSION,
    operationId: input.operationId ?? createOperationId(),
    deviceId: input.deviceId,
    sequence: input.sequence,
    recordedAt: (input.now ?? new Date()).toISOString(),
    mutation: input.mutation,
  };
}

export function compareOperationJournalEntries(
  left: OperationJournalEntry,
  right: OperationJournalEntry,
): number {
  if (left.deviceId !== right.deviceId) {
    return left.deviceId.localeCompare(right.deviceId);
  }
  return left.sequence - right.sequence;
}

function createOperationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `operation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
