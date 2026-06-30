import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createTransactionImportPerformanceReport,
  formatImportDuration,
  type TransactionImportPerformanceEntry,
} from "../apps/web/src/features/accounts/transactionImport";

const dialogSource = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);
const importSource = readFileSync(
  "apps/web/src/features/accounts/transactionImport.ts",
  "utf8",
);
const registerCss = readFileSync("apps/web/src/styles/register.css", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const entries: TransactionImportPerformanceEntry[] = [
  { label: "Parse file", durationMs: 12.4 },
  { label: "Review import", durationMs: 35.6 },
  { label: "Commit transactions", durationMs: 2000 },
];
const report = createTransactionImportPerformanceReport(entries);

assert.equal(report.entries.length, 3);
assert.equal(report.totalMs, 2048);
assert.equal(formatImportDuration(12.4), "12 ms");
assert.equal(formatImportDuration(999.4), "999 ms");
assert.equal(formatImportDuration(2048), "2.05 s");

assert.match(importSource, /TransactionImportPerformanceEntry/);
assert.match(importSource, /TransactionImportPerformanceReport/);
assert.match(importSource, /createTransactionImportPerformanceReport/);
assert.match(importSource, /formatImportDuration/);

assert.match(dialogSource, /measureImportStage/);
assert.match(dialogSource, /measureAsyncImportStage/);
assert.match(dialogSource, /performanceReport/);
assert.match(dialogSource, /createTransactionImportPerformanceReport/);
assert.match(dialogSource, /Import performance/);
assert.match(dialogSource, /Total measured time/);
assert.match(dialogSource, /Read file/);
assert.match(dialogSource, /Commit transactions/);
assert.match(dialogSource, /setPerformanceReport\(createTransactionImportPerformanceReport\(timings\)\)/);

assert.match(registerCss, /transaction-import-performance-panel/);
assert.match(registerCss, /transaction-import-performance-row/);

assert.equal(
  packageJson.scripts["test:v2403:import-performance-analysis"],
  "tsx tests/v2403-import-performance-analysis.ts",
);
assert.equal(
  packageJson.scripts["test:v2403"],
  "pnpm test:v2402 && pnpm test:v2403:import-performance-analysis",
);

console.log("v2.40.3 import performance analysis checks passed");
