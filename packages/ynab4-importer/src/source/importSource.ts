/**
 * Format-neutral contracts for large imports.
 *
 * These types deliberately know nothing about JSON, archives, SQLite, YNAB4,
 * or Actual Budget. Format implementations choose their own summary,
 * reference-data and record types.
 */
export interface ImportReadOptions {
  readonly signal?: AbortSignal;
}

export interface ImportStreamOptions extends ImportReadOptions {
  readonly batchSize?: number;
}

export interface ImportProgress {
  readonly unitsConsumed: number;
  readonly totalUnits: number | null;
  readonly phase: string | null;
  readonly recordsYielded: number;
}

export interface ImportSourceReader<TSummary, TReferenceData, TRecord> {
  inspect(options?: ImportReadOptions): Promise<TSummary>;
  readReferenceData(options?: ImportReadOptions): Promise<TReferenceData>;
  streamRecords(options?: ImportStreamOptions): AsyncIterable<readonly TRecord[]>;
  close(): Promise<void>;
}

export interface ImportSourceValidationResult<TIssue = string> {
  readonly valid: boolean;
  readonly issues: readonly TIssue[];
}

/**
 * Persistence lifecycle used by a later streaming-import coordinator.
 * Implementations own their transaction/staging mechanism. Rollback is
 * explicit and commit is separate from batch persistence.
 */
export interface ImportSession<
  TSummary,
  TReferenceData,
  TRecord,
  TPersistedBatch,
  TResult,
  TIssue = string,
> {
  validateSource(
    summary: TSummary,
    referenceData: TReferenceData,
    options?: ImportReadOptions,
  ): Promise<ImportSourceValidationResult<TIssue>>;
  begin(
    summary: TSummary,
    referenceData: TReferenceData,
    options?: ImportReadOptions,
  ): Promise<void>;
  persistBatch(
    records: readonly TRecord[],
    options?: ImportReadOptions,
  ): Promise<TPersistedBatch>;
  commit(options?: ImportReadOptions): Promise<TResult>;
  rollback(cause: unknown): Promise<void>;
  close(): Promise<void>;
}

export type ImportSourceCapabilities = {
  readonly inspect: true;
  readonly referenceData: true;
  readonly boundedRecordStreaming: true;
  readonly cancellation: true;
  readonly progress: boolean;
  readonly diagnostics: boolean;
};
