import assert from "node:assert/strict";
import test from "node:test";

import { runProjectionBenchmark } from "../../../tools/performance/p0-6-projection-benchmark.js";

test("P0.6 projection benchmark preserves target-month correctness across replay windows", async () => {
  const report = await runProjectionBenchmark({
    monthCount: 12,
    categoryCount: 20,
    accountCount: 4,
    transactionCount: 2_000,
    iterations: 1,
    replayWindows: [1, 6, 12],
    outputPath: null,
  });

  assert.equal(report.replayWindows.length, 3);
  assert.ok(
    report.replayWindows.every((window) => window.correctness.matchesFullProjection),
    "every suffix replay must reproduce the full-history target projection",
  );
  assert.ok(
    report.replayWindows.every((window) => window.timingsMs.totalColdPath.max < 10_000),
    "the smoke fixture should finish each replay inside a deliberately generous 10s ceiling",
  );
});
