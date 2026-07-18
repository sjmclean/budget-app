export type TransactionImportTraceStage =
  | "source"
  | "validation"
  | "merchant-resolution"
  | "reconciliation"
  | "proposal"
  | "duplicate-recovery"
  | "review"
  | "commit";

export interface TransactionImportTraceEntry {
  stage: TransactionImportTraceStage;
  timestamp: string;
  durationMs?: number;
  input?: Readonly<Record<string, unknown>>;
  output?: Readonly<Record<string, unknown>>;
  detail?: string;
}

export function createTransactionImportTraceEntry(
  entry: Omit<TransactionImportTraceEntry, "timestamp">,
): TransactionImportTraceEntry {
  return { ...entry, timestamp: new Date().toISOString() };
}

export function appendTransactionImportTrace<T extends { trace?: readonly TransactionImportTraceEntry[] }>(
  candidate: T,
  entry: Omit<TransactionImportTraceEntry, "timestamp">,
): T {
  return {
    ...candidate,
    trace: [...(candidate.trace ?? []), createTransactionImportTraceEntry(entry)],
  };
}

export function serialiseTransactionImportTrace(
  traces: readonly { id: string; trace?: readonly TransactionImportTraceEntry[] }[],
): string {
  return JSON.stringify(
    traces.map((candidate) => ({ id: candidate.id, trace: candidate.trace ?? [] })),
    null,
    2,
  );
}
