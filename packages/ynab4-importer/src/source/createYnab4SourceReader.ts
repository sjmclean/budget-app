import { throwIfAborted, Ynab4SourceError } from "./errors.js";
import { IncrementalJsonCursor } from "./incrementalJsonReader.js";
import type {
  Ynab4ChunkSource,
  Ynab4SmallCollections,
  Ynab4SourceReader,
  Ynab4SourceReaderOptions,
  Ynab4SourceRecord,
  Ynab4StreamOptions,
} from "./types.js";

const LARGE_COLLECTIONS = new Set(["transactions", "scheduledTransactions"]);
const DEFAULT_CHUNK_SIZE = 64 * 1024;
const DEFAULT_BATCH_SIZE = 500;

export function createYnab4SourceReader(
  source: Blob | Uint8Array | string | Ynab4ChunkSource,
  options: Ynab4SourceReaderOptions = {},
): Ynab4SourceReader {
  const chunkSource = toChunkSource(source);
  const sourceName = options.sourceName ?? inferSourceName(source);
  const chunkSize = positiveInteger(options.chunkSize ?? DEFAULT_CHUNK_SIZE, "chunkSize");
  let closed = false;
  let smallCache: Promise<{
    keys: readonly string[];
    values: Record<string, unknown>;
  }> | null = null;

  const cursor = (signal?: AbortSignal) => {
    if (closed) throw new Error(`YNAB4 source reader for ${sourceName} is closed.`);
    throwIfAborted(signal);
    return new IncrementalJsonCursor(
      chunkSource,
      sourceName,
      chunkSize,
      signal,
      options.diagnostics,
      options.onProgress,
    );
  };

  async function readSmall(signal?: AbortSignal): Promise<{ keys: readonly string[]; values: Record<string, unknown> }> {
    const values: Record<string, unknown> = Object.create(null);
    const parser = cursor(signal);
    const keys = await parser.scanTopLevel(async (key, valueCursor) => {
      if (LARGE_COLLECTIONS.has(key)) {
        await valueCursor.readArrayRecords(key, async () => undefined);
      } else {
        values[key] = await valueCursor.readValue(key);
      }
    });
    return { keys, values };
  }

  async function readSmallCached(
    signal?: AbortSignal,
  ): Promise<{ keys: readonly string[]; values: Record<string, unknown> }> {
    throwIfAborted(signal);
    if (!smallCache) {
      smallCache = readSmall(signal).catch((error) => {
        smallCache = null;
        throw error;
      });
    }
    const result = await smallCache;
    throwIfAborted(signal);
    return result;
  }

  async function* streamCollection(
    collection: "transactions" | "scheduledTransactions",
    streamOptions: Ynab4StreamOptions = {},
  ): AsyncGenerator<readonly Ynab4SourceRecord[]> {
    const batchSize = positiveInteger(streamOptions.batchSize ?? DEFAULT_BATCH_SIZE, "batchSize");
    const parser = cursor(streamOptions.signal);
    let batch: Ynab4SourceRecord[] = [];
    for await (const record of parser.streamTopLevelRecords(collection)) {
      throwIfAborted(streamOptions.signal);
      batch.push(record);
      if (batch.length < batchSize) continue;
      const ready = batch;
      batch = [];
      if (options.diagnostics) {
        if (collection === "transactions") {
          options.diagnostics.transactionsYielded += ready.length;
          options.diagnostics.transactionBatchesYielded += 1;
        } else {
          options.diagnostics.scheduledTransactionsYielded += ready.length;
          options.diagnostics.scheduledTransactionBatchesYielded += 1;
        }
      }
      yield ready;
    }
    if (batch.length > 0) {
      if (options.diagnostics) {
        if (collection === "transactions") {
          options.diagnostics.transactionsYielded += batch.length;
          options.diagnostics.transactionBatchesYielded += 1;
        } else {
          options.diagnostics.scheduledTransactionsYielded += batch.length;
          options.diagnostics.scheduledTransactionBatchesYielded += 1;
        }
      }
      yield batch;
    }
  }

  return {
    async getMetadata(metadataOptions = {}) {
      const { keys } = await readSmallCached(metadataOptions.signal);
      return { format: "ynab4-json", sourceName, size: chunkSource.size, topLevelKeys: keys };
    },
    async readSmallCollections(smallOptions = {}): Promise<Ynab4SmallCollections> {
      const { values } = await readSmallCached(smallOptions.signal);
      return {
        accounts: records(values.accounts, "accounts", sourceName),
        masterCategories: records(values.masterCategories, "masterCategories", sourceName),
        payees: records(values.payees, "payees", sourceName),
        monthlyBudgets: records(values.monthlyBudgets, "monthlyBudgets", sourceName),
        values,
      };
    },
    inspect(metadataOptions = {}) {
      return this.getMetadata(metadataOptions);
    },
    readReferenceData(smallOptions = {}) {
      return this.readSmallCollections(smallOptions);
    },
    streamRecords(streamOptions) {
      return this.streamTransactions(streamOptions);
    },
    streamTransactions: (streamOptions) => streamCollection("transactions", streamOptions),
    streamScheduledTransactions: (streamOptions) => streamCollection("scheduledTransactions", streamOptions),
    async close() {
      if (closed) return;
      closed = true;
      smallCache = null;
      await chunkSource.close?.();
    },
  };
}

function toChunkSource(source: Blob | Uint8Array | string | Ynab4ChunkSource): Ynab4ChunkSource {
  if (typeof source === "string") return byteArraySource(new TextEncoder().encode(source));
  if (source instanceof Uint8Array) return byteArraySource(source);
  if (typeof Blob !== "undefined" && source instanceof Blob) {
    return {
      size: source.size,
      async read(offset, maximumBytes, signal) {
        throwIfAborted(signal);
        const bytes = new Uint8Array(await source.slice(offset, offset + maximumBytes).arrayBuffer());
        throwIfAborted(signal);
        return bytes;
      },
    };
  }
  if (isChunkSource(source)) return source;
  throw new TypeError("Unsupported YNAB4 source. Expected Blob, string, Uint8Array, or Ynab4ChunkSource.");
}

function byteArraySource(bytes: Uint8Array): Ynab4ChunkSource {
  return {
    size: bytes.byteLength,
    async read(offset, maximumBytes, signal) {
      throwIfAborted(signal);
      return bytes.slice(offset, Math.min(bytes.byteLength, offset + maximumBytes));
    },
  };
}

function isChunkSource(value: unknown): value is Ynab4ChunkSource {
  return value !== null && typeof value === "object" && typeof (value as Ynab4ChunkSource).read === "function";
}

function inferSourceName(value: unknown): string {
  if (value !== null && typeof value === "object") {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string" && name.length > 0) return name;
  }
  return "YNAB4 source";
}

function records(value: unknown, collection: string, sourceName: string): readonly Ynab4SourceRecord[] {
  if (!Array.isArray(value)) throw new Ynab4SourceError(`Expected "${collection}" to be an array.`, sourceName, collection, 0, "schema");
  if (!value.every((item) => item !== null && typeof item === "object" && !Array.isArray(item))) {
    throw new Ynab4SourceError(`Expected every "${collection}" member to be an object.`, sourceName, collection, 0, "schema");
  }
  return value as Ynab4SourceRecord[];
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer.`);
  return value;
}
