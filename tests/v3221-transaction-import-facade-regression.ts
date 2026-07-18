import assert from "node:assert/strict";

import {
  createTransactionImportPerformanceReport,
  formatImportDuration,
  type TransactionImportCandidate,
  type TransactionImportPerformanceEntry,
  type TransactionImportPerformanceReport,
} from "../apps/web/src/features/accounts/transactionImport";

const entries: TransactionImportPerformanceEntry[] = [
  { label: "Parse", durationMs: 12.4 },
  { label: "Reconcile", durationMs: 35.6 },
  { label: "Commit", durationMs: 2000 },
];
const report: TransactionImportPerformanceReport =
  createTransactionImportPerformanceReport(entries);

assert.equal(report.totalMs, 2048);
assert.equal(report.entries.length, 3);
assert.equal(formatImportDuration(12.4), "12 ms");
assert.equal(formatImportDuration(2048), "2.05 s");

const candidateShape: Pick<
  TransactionImportCandidate,
  "id" | "status" | "selected" | "errors"
> = {
  id: "candidate-1",
  status: "new",
  selected: true,
  errors: [],
};

assert.equal(candidateShape.status, "new");

console.log("v3.22.1 transaction import facade regression tests passed");
