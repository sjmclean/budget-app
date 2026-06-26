import assert from "node:assert/strict";
import {
  buildRegisterPerformanceSnapshot,
  formatPerformanceMs,
  measureRegisterPerformance,
  type RegisterPerformanceTimings,
} from "../apps/web/src/features/performance/registerPerformanceInstrumentation";

const timings: RegisterPerformanceTimings = {};
const result = measureRegisterPerformance(true, timings, "transaction index", () => 42);

assert.equal(result, 42);
assert.equal(typeof timings["transaction index"], "number");
assert.ok((timings["transaction index"] ?? -1) >= 0);

const snapshot = buildRegisterPerformanceSnapshot({
  enabled: true,
  renderStartedAt: null,
  totalTransactions: 1234,
  visibleTransactions: 100,
  currentPage: 3,
  totalPages: 13,
  pageSize: 100,
  payeeManagerOpen: false,
  payeeSummaryCount: 0,
  selectedTransaction: true,
  editingTransaction: false,
  timings,
});

assert.ok(snapshot);
assert.equal(snapshot.totalTransactions, 1234);
assert.equal(snapshot.visibleTransactions, 100);
assert.equal(snapshot.currentPage, 3);
assert.equal(snapshot.totalPages, 13);
assert.equal(snapshot.pageSize, 100);
assert.equal(snapshot.payeeManagerOpen, false);
assert.equal(snapshot.selectedTransaction, true);
assert.equal(snapshot.editingTransaction, false);
assert.equal(snapshot.timings["transaction index"], timings["transaction index"]);
assert.match(formatPerformanceMs(snapshot.timings["transaction index"]), /ms$/);
assert.equal(formatPerformanceMs(null), "—");

assert.equal(
  buildRegisterPerformanceSnapshot({
    enabled: false,
    renderStartedAt: null,
    totalTransactions: 0,
    visibleTransactions: 0,
    currentPage: 1,
    totalPages: 1,
    pageSize: 100,
    payeeManagerOpen: false,
    payeeSummaryCount: 0,
    selectedTransaction: false,
    editingTransaction: false,
    timings: {},
  }),
  null,
);

console.log("v2.00 register performance instrumentation checks passed");
