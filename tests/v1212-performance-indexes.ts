import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initDatabase } from "../packages/database/src/initDatabase.js";
import { PerformanceIndexApplicationService } from "../packages/application/src/index.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const sqlite = new Database(join(mkdtempSync(join(tmpdir(), "v1212-indexes-")), "indexes.sqlite"));
initDatabase(sqlite);
const perf = new PerformanceIndexApplicationService(sqlite);
const indexes = new Set(perf.listIndexes());

for (const required of [
  "idx_transactions_account_date",
  "idx_transactions_budget_date",
  "idx_transactions_budget_amount",
  "idx_transaction_flags_colour",
  "idx_tag_assignments_tag_id"
]) {
  assert(indexes.has(required), `Expected index ${required}`);
}

const scanIssues = perf.findFullScanIssues();
assert(scanIssues.length === 0, `Expected indexed query plans, found: ${JSON.stringify(scanIssues)}`);

console.log("PASS: v1.2.12 performance indexes and query plans");
