import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { selectOutboxPushBatch } from "../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.js";

type BenchmarkRow = {
  sequence: number;
  mutationId: string;
  deviceId: string;
  deviceSequence: number;
  baseCursor: number;
  domain: "transactions";
  entityId: string;
  operation: "upsert";
  payloadJson: string;
  createdAt: string;
  operationGroupId: null;
  operationGroupJson: null;
};

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  return raw === undefined ? fallback : Number(raw);
}

const operationCount = readNumber("LOCAL_FIRST_SYNC_OPERATIONS", 20_000);
const payloadBytes = readNumber("LOCAL_FIRST_SYNC_PAYLOAD_BYTES", 256);
const budgetId = "benchmark-budget";
const syncEpoch = "benchmark-epoch";
const payload = "x".repeat(Math.max(1, payloadBytes - 64));
const rows: BenchmarkRow[] = Array.from({ length: operationCount }, (_, index) => ({
  sequence: index + 1,
  mutationId: `mutation-${index + 1}`,
  deviceId: "benchmark-device",
  deviceSequence: index + 1,
  baseCursor: 0,
  domain: "transactions",
  entityId: `transaction-${index + 1}`,
  operation: "upsert",
  payloadJson: JSON.stringify({ amount: index, memo: payload }),
  createdAt: "2026-09-20T00:00:00.000Z",
  operationGroupId: null,
  operationGroupJson: null,
}));

const heapBefore = process.memoryUsage().heapUsed;
const started = performance.now();
let cursor = 0;
let batches = 0;
let encodedBytes = 0;
let convertedMutations = 0;

while (cursor < rows.length) {
  const pending = rows.slice(cursor, cursor + 500);
  const batch = selectOutboxPushBatch(
    pending as Parameters<typeof selectOutboxPushBatch>[0],
    budgetId,
    syncEpoch,
  );
  if (batch.rows.length === 0) throw new Error("The local-first push batch made no progress.");
  cursor += batch.rows.length;
  batches += 1;
  convertedMutations += batch.mutations.length;
  encodedBytes += batch.encodedBytes;

  // Model the relay JSON round-trip and client-side remote envelope hydration.
  const wire = JSON.stringify({ budgetId, syncEpoch, mutations: batch.mutations });
  const decoded = JSON.parse(wire) as { mutations: unknown[] };
  if (decoded.mutations.length !== batch.mutations.length) {
    throw new Error("The local-first relay batch diverged during JSON round-trip.");
  }
}

const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
const memory = process.memoryUsage();
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  configuration: { operationCount, payloadBytes },
  results: {
    batches,
    convertedMutations,
    encodedBytes,
    operationsPerSecond: Math.round(operationCount / Math.max(elapsedMs / 1000, 0.001)),
  },
  timingsMs: { total: elapsedMs },
  memory: {
    heapUsedBeforeBytes: heapBefore,
    heapUsedAfterBytes: memory.heapUsed,
    heapDeltaBytes: memory.heapUsed - heapBefore,
    rssAfterBytes: memory.rss,
  },
};

if (convertedMutations !== operationCount) {
  throw new Error(`Expected ${operationCount} mutations, converted ${convertedMutations}.`);
}

const outputPath = resolve(process.env.LOCAL_FIRST_SYNC_OUTPUT ?? "test-results/local-first-sync-performance.json");
await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
