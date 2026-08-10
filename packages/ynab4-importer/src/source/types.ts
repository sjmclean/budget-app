export type Ynab4SourceRecord = Record<string, unknown>;
export type Ynab4SourceTransaction = Ynab4SourceRecord;
export type Ynab4SourceScheduledTransaction = Ynab4SourceRecord;

export interface Ynab4SourceMetadata {
  readonly format: "ynab4-json";
  readonly sourceName: string;
  readonly size: number | null;
  readonly topLevelKeys: readonly string[];
}

export interface Ynab4SmallCollections {
  readonly accounts: readonly Ynab4SourceRecord[];
  readonly masterCategories: readonly Ynab4SourceRecord[];
  readonly payees: readonly Ynab4SourceRecord[];
  readonly monthlyBudgets: readonly Ynab4SourceRecord[];
  /** Other non-large top-level properties, in source order. */
  readonly values: Readonly<Record<string, unknown>>;
}

export type Ynab4StreamOptions = ImportStreamOptions;

export interface Ynab4ReaderProgress extends ImportProgress {
  readonly bytesConsumed: number;
  readonly totalBytes: number | null;
  readonly collection: string | null;
}

export interface Ynab4ReaderDiagnostics {
  bytesRead: number;
  chunksRead: number;
  maximumBufferedBytes: number;
  transactionsYielded: number;
  scheduledTransactionsYielded: number;
  transactionBatchesYielded: number;
  scheduledTransactionBatchesYielded: number;
}

export interface Ynab4SourceReaderOptions {
  readonly sourceName?: string;
  readonly chunkSize?: number;
  readonly diagnostics?: Ynab4ReaderDiagnostics;
  readonly onProgress?: (progress: Ynab4ReaderProgress) => void;
}

export interface Ynab4JsonSourceReader
  extends ImportSourceReader<
    Ynab4SourceMetadata,
    Ynab4SmallCollections,
    Ynab4SourceTransaction
  > {
  inspect(options?: ImportReadOptions): Promise<Ynab4SourceMetadata>;
  readReferenceData(options?: ImportReadOptions): Promise<Ynab4SmallCollections>;
  streamRecords(
    options?: ImportStreamOptions,
  ): AsyncIterable<readonly Ynab4SourceTransaction[]>;
  getMetadata(options?: Pick<Ynab4StreamOptions, "signal">): Promise<Ynab4SourceMetadata>;
  readSmallCollections(options?: Pick<Ynab4StreamOptions, "signal">): Promise<Ynab4SmallCollections>;
  streamTransactions(
    options?: Ynab4StreamOptions,
  ): AsyncIterable<readonly Ynab4SourceTransaction[]>;
  streamScheduledTransactions(
    options?: Ynab4StreamOptions,
  ): AsyncIterable<readonly Ynab4SourceScheduledTransaction[]>;
  close(): Promise<void>;
}

/** Backward-compatible YNAB4-specific name retained for existing callers. */
export type Ynab4SourceReader = Ynab4JsonSourceReader;

export interface Ynab4ChunkSource {
  readonly size: number | null;
  read(offset: number, maximumBytes: number, signal?: AbortSignal): Promise<Uint8Array>;
  close?(): Promise<void>;
}

export function createYnab4ReaderDiagnostics(): Ynab4ReaderDiagnostics {
  return {
    bytesRead: 0,
    chunksRead: 0,
    maximumBufferedBytes: 0,
    transactionsYielded: 0,
    scheduledTransactionsYielded: 0,
    transactionBatchesYielded: 0,
    scheduledTransactionBatchesYielded: 0,
  };
}
import type {
  ImportProgress,
  ImportReadOptions,
  ImportSourceReader,
  ImportStreamOptions,
} from "./importSource.js";
