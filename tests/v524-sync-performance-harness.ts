import assert from "node:assert/strict";
import { runSyncBenchmark } from "../tools/performance/v524-sync-benchmark.js";

const report = await runSyncBenchmark({ operationCount: 1_200, clientCount: 3, batchSize: 125, payloadBytes: 128, outputPath: null });
assert.equal(report.schemaVersion, 1);
assert.equal(report.results.converged, true, "all benchmark replicas must converge");
assert.equal(report.results.serverOperations, 1_200, "the server must retain every logical operation once");
assert.equal(report.results.latestCursor, 1_200);
assert.ok(report.results.checkpointBytes > 100_000, "benchmark must exercise a non-trivial checkpoint payload");
assert.ok(report.results.canonicalHash.length === 64, "canonical state hash must be SHA-256");
assert.ok(report.throughput.initialOperationsPerSecond > 0);
assert.ok(report.timingsMs.total < 60_000, "smoke workload exceeded the deliberately generous one-minute ceiling");
assert.ok(report.memory.rssAfterBytes > 0);
console.log(`v524 sync performance harness: pass (${report.throughput.initialOperationsPerSecond} initial ops/s, ${report.timingsMs.total} ms total)`);
