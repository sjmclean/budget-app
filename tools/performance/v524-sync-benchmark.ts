import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { replicatePersistenceProvider } from "../../apps/web/src/features/persistence/replicationEngine.js";
import { createOperationJournalEntry, type OperationJournalEntry } from "../../apps/web/src/features/persistence/operationJournal.js";
import type { RemoteOperationEnvelope, ReplicationCursorState, ReplicationTransport } from "../../apps/web/src/features/persistence/replication.js";

export type SyncBenchmarkOptions = {
  operationCount: number;
  clientCount: number;
  batchSize: number;
  payloadBytes: number;
  outputPath?: string | null;
};

export type SyncBenchmarkReport = {
  schemaVersion: 1;
  generatedAt: string;
  configuration: SyncBenchmarkOptions;
  dataset: { operations: number; clients: number; approximatePayloadBytes: number };
  timingsMs: { generate: number; initialSync: number; convergence: number; canonicalHash: number; checkpointSerialize: number; checkpointRestore: number; total: number };
  throughput: { initialOperationsPerSecond: number; convergedDeliveriesPerSecond: number };
  memory: { heapUsedBeforeBytes: number; heapUsedAfterBytes: number; heapDeltaBytes: number; rssAfterBytes: number };
  results: { serverOperations: number; latestCursor: number; converged: boolean; canonicalHash: string; checkpointBytes: number };
};

class BenchmarkServer {
  readonly generationId = "v524-benchmark-generation";
  readonly operations: RemoteOperationEnvelope[] = [];
  readonly operationIds = new Set<string>();

  transport(): ReplicationTransport {
    return {
      getGeneration: async () => ({ protocolVersion: 1, generationId: this.generationId, latestCursor: this.operations.length, latestCheckpointId: null }),
      pushOperations: async (_generationId, entries) => {
        let acceptedCount = 0;
        for (const operation of entries) {
          if (this.operationIds.has(operation.operationId)) continue;
          this.operationIds.add(operation.operationId);
          this.operations.push({ cursor: this.operations.length + 1, generationId: this.generationId, operation, receivedAt: new Date(0).toISOString() });
          acceptedCount += 1;
        }
        return { generationId: this.generationId, acceptedCount, acknowledgedCount: entries.length, latestCursor: this.operations.length };
      },
      pullOperations: async (_generationId, afterCursor, limit = 500) => ({
        generationId: this.generationId,
        operations: this.operations.slice(afterCursor, afterCursor + limit),
        latestCursor: this.operations.length,
        hasMore: afterCursor + limit < this.operations.length,
      }),
      uploadCheckpoint: async () => { throw new Error("not used by benchmark"); },
      getLatestCheckpoint: async () => null,
      hasBlob: async () => true,
      uploadBlob: async () => undefined,
      downloadBlob: async () => null,
    };
  }
}

class BenchmarkClient {
  readonly values = new Map<string, string>();
  readonly journal: OperationJournalEntry[] = [];
  readonly appliedRemoteIds = new Set<string>();
  cursor: ReplicationCursorState = { generationId: null, pushedLocalSequence: 0, pulledRemoteCursor: 0 };

  constructor(readonly id: string) {}

  write(key: string, value: string): void {
    const sequence = this.journal.length + 1;
    this.journal.push(createOperationJournalEntry({
      deviceId: this.id,
      sequence,
      operationId: `${this.id}-${sequence}`,
      now: new Date(sequence),
      mutation: { type: "key-value.set", key, value },
    }));
    this.values.set(key, value);
  }

  provider(): any {
    return {
      operationJournal: {
        getJournalCursor: () => ({ deviceId: this.id, latestSequence: this.journal.length }),
        readJournal: async (afterSequence = 0, limit = 500) => this.journal.filter((entry) => entry.sequence > afterSequence).slice(0, limit),
      },
      replicationStore: {
        getReplicationCursorState: async () => this.cursor,
        setReplicationCursorState: async (state: ReplicationCursorState) => { this.cursor = state; },
        applyRemoteOperations: async (envelopes: readonly RemoteOperationEnvelope[]) => {
          let applied = 0;
          for (const envelope of envelopes) {
            if (this.appliedRemoteIds.has(envelope.operation.operationId)) continue;
            this.appliedRemoteIds.add(envelope.operation.operationId);
            const mutation = envelope.operation.mutation;
            if (mutation.type === "key-value.set") this.values.set(mutation.key, mutation.value);
            else this.values.delete(mutation.key);
            applied += 1;
          }
          return applied;
        },
        getReplicationDiagnostics: async () => ({ deviceId: this.id, latestLocalSequence: this.journal.length, retainedJournalEntryCount: this.journal.length, oldestRetainedSequence: this.journal[0]?.sequence ?? null, latestCheckpointId: null, checkpointCount: 0, generationId: this.cursor.generationId, pushedLocalSequence: this.cursor.pushedLocalSequence, pulledRemoteCursor: this.cursor.pulledRemoteCursor, unresolvedConflictCount: 0 }),
        pruneJournal: async () => 0,
        listConflicts: async () => [],
        resolveConflict: async () => undefined,
      },
      flush: async () => undefined,
    };
  }
}

const round = (value: number): number => Math.round(value * 100) / 100;
const elapsed = (start: number): number => round(performance.now() - start);
const hashState = (values: Map<string, string>): string => createHash("sha256").update(JSON.stringify([...values].sort(([a], [b]) => a.localeCompare(b)))).digest("hex");

export async function runSyncBenchmark(options: SyncBenchmarkOptions): Promise<SyncBenchmarkReport> {
  if (!Number.isSafeInteger(options.operationCount) || options.operationCount < 1) throw new Error("operationCount must be a positive safe integer");
  if (!Number.isSafeInteger(options.clientCount) || options.clientCount < 2) throw new Error("clientCount must be at least 2");
  if (!Number.isSafeInteger(options.batchSize) || options.batchSize < 1) throw new Error("batchSize must be positive");
  if (!Number.isSafeInteger(options.payloadBytes) || options.payloadBytes < 8) throw new Error("payloadBytes must be at least 8");

  const totalStarted = performance.now();
  const heapBefore = process.memoryUsage().heapUsed;
  const server = new BenchmarkServer();
  const clients = Array.from({ length: options.clientCount }, (_, index) => new BenchmarkClient(`benchmark-device-${index + 1}`));
  const payload = "x".repeat(options.payloadBytes - 8);

  let started = performance.now();
  for (let index = 0; index < options.operationCount; index += 1) {
    const client = clients[index % clients.length]!;
    client.write(`transaction/${index.toString().padStart(8, "0")}`, `${index}:${payload}`);
  }
  const generate = elapsed(started);

  started = performance.now();
  for (const client of clients) await replicatePersistenceProvider(client.provider(), server.transport(), { batchSize: options.batchSize });
  const initialSync = elapsed(started);

  started = performance.now();
  for (let roundIndex = 0; roundIndex < 20; roundIndex += 1) {
    for (const client of clients) await replicatePersistenceProvider(client.provider(), server.transport(), { batchSize: options.batchSize });
    if (clients.every((client) => client.cursor.pulledRemoteCursor === server.operations.length)) break;
  }
  const convergence = elapsed(started);

  started = performance.now();
  const hashes = clients.map((client) => hashState(client.values));
  const canonicalHash = hashes[0]!;
  const canonicalHashTime = elapsed(started);
  const converged = hashes.every((hash) => hash === canonicalHash) && clients.every((client) => client.values.size === options.operationCount);

  started = performance.now();
  const checkpoint = JSON.stringify([...clients[0]!.values].sort(([a], [b]) => a.localeCompare(b)));
  const checkpointSerialize = elapsed(started);
  started = performance.now();
  const restored = new Map<string, string>(JSON.parse(checkpoint));
  const checkpointRestore = elapsed(started);
  if (restored.size !== options.operationCount || hashState(restored) !== canonicalHash) throw new Error("checkpoint round-trip diverged");

  const memory = process.memoryUsage();
  const report: SyncBenchmarkReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    configuration: options,
    dataset: { operations: options.operationCount, clients: options.clientCount, approximatePayloadBytes: options.operationCount * options.payloadBytes },
    timingsMs: { generate, initialSync, convergence, canonicalHash: canonicalHashTime, checkpointSerialize, checkpointRestore, total: elapsed(totalStarted) },
    throughput: {
      initialOperationsPerSecond: round(options.operationCount / Math.max(initialSync / 1000, 0.001)),
      convergedDeliveriesPerSecond: round((options.operationCount * options.clientCount) / Math.max((initialSync + convergence) / 1000, 0.001)),
    },
    memory: { heapUsedBeforeBytes: heapBefore, heapUsedAfterBytes: memory.heapUsed, heapDeltaBytes: memory.heapUsed - heapBefore, rssAfterBytes: memory.rss },
    results: { serverOperations: server.operations.length, latestCursor: server.operations.length, converged, canonicalHash, checkpointBytes: Buffer.byteLength(checkpoint) },
  };

  if (options.outputPath) {
    const outputPath = resolve(options.outputPath);
    await mkdir(resolve(outputPath, ".."), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  return raw === undefined ? fallback : Number(raw);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runSyncBenchmark({
    operationCount: readNumber("BENCHMARK_OPERATIONS", 20_000),
    clientCount: readNumber("BENCHMARK_CLIENTS", 3),
    batchSize: readNumber("BENCHMARK_BATCH_SIZE", 500),
    payloadBytes: readNumber("BENCHMARK_PAYLOAD_BYTES", 192),
    outputPath: process.env.BENCHMARK_OUTPUT ?? "test-results/v524-sync-performance.json",
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.results.converged) process.exitCode = 1;
}
