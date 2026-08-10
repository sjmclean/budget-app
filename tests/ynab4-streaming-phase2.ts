import assert from "node:assert/strict";
import {
  createYnab4SourceReader,
  runImportSession,
  Ynab4StreamingPreflightSession,
  type ImportSession,
  type ImportSourceReader,
} from "../packages/ynab4-importer/src/source/index.js";

const source = JSON.stringify({
  accounts: [
    { entityId: "a1", name: "Checking" },
    { entityId: "a2", name: "Savings" },
  ],
  masterCategories: [{
    entityId: "g1",
    name: "Living",
    subCategories: [{ entityId: "c1", name: "Food" }],
  }],
  payees: [{ entityId: "p1", name: "Shop" }],
  monthlyBudgets: [],
  transactions: [
    { entityId: "t1", accountId: "a1", categoryId: "c1", payeeId: "p1", amount: -25 },
    // Reciprocal transfer deliberately crosses batch boundaries.
    { entityId: "t2", accountId: "a1", targetAccountId: "a2", amount: -100, transferTransactionId: "t4" },
    { entityId: "t3", accountId: "a1", categoryId: "Category/__ImmediateIncome__", amount: 50 },
    { entityId: "t4", accountId: "a2", targetAccountId: "a1", amount: 100, transferTransactionId: "t2" },
  ],
  scheduledTransactions: [],
});

const result = await runImportSession(
  createYnab4SourceReader(source, { chunkSize: 5 }),
  new Ynab4StreamingPreflightSession(),
  { batchSize: 2 },
);
assert.deepEqual(result, {
  format: "ynab4-json",
  transactionsValidated: 4,
  transferReferencesSeen: 2,
  duplicateTransactionIds: 0,
});

// Invalid cross-batch transfer pairing fails at commit and is rolled back.
const badTransfer = source.replace('"transferTransactionId":"t2"', '"transferTransactionId":"missing"');
await assert.rejects(
  () => runImportSession(
    createYnab4SourceReader(badTransfer, { chunkSize: 3 }),
    new Ynab4StreamingPreflightSession(),
    { batchSize: 1 },
  ),
  /valid reciprocal pair/,
);

// YNAB4 transfer legs can live inside split subtransactions. Split rows inherit
// their parent account and must participate in reciprocal-pair validation.
const splitTransferSource = JSON.stringify({
  accounts: [
    { entityId: "a1", name: "Checking" },
    { entityId: "a2", name: "Savings" },
  ],
  masterCategories: [],
  payees: [],
  monthlyBudgets: [],
  transactions: [
    {
      entityId: "split-parent",
      accountId: "a1",
      categoryId: "Category/__Split__",
      amount: -100,
      subTransactions: [{
        entityId: "3F15F2D8-B0B9-1889-FDCF-D748B7140ACD_T_0",
        targetAccountId: "a2",
        amount: -100,
        transferTransactionId: "reciprocal-transfer",
      }],
    },
    {
      entityId: "reciprocal-transfer",
      accountId: "a2",
      targetAccountId: "a1",
      amount: 100,
      transferTransactionId:
        "3F15F2D8-B0B9-1889-FDCF-D748B7140ACD_T_0",
    },
  ],
  scheduledTransactions: [],
});
const splitResult = await runImportSession(
  createYnab4SourceReader(splitTransferSource, { chunkSize: 11 }),
  new Ynab4StreamingPreflightSession(),
  { batchSize: 1 },
);
assert.equal(splitResult.transactionsValidated, 2);
assert.equal(splitResult.transferReferencesSeen, 2);

// Generic coordinator guarantees begin -> batches -> commit and rollback on a
// later batch failure. It also closes both resources.
type Summary = { format: "test" };
type References = { ok: true };
type Row = { id: number };
const events: string[] = [];
const reader: ImportSourceReader<Summary, References, Row> = {
  async inspect() { events.push("inspect"); return { format: "test" }; },
  async readReferenceData() { events.push("references"); return { ok: true }; },
  async *streamRecords() {
    yield [{ id: 1 }];
    yield [{ id: 2 }];
  },
  async close() { events.push("reader-close"); },
};
const failingSession: ImportSession<Summary, References, Row, number, boolean> = {
  async validateSource() { events.push("validate"); return { valid: true, issues: [] }; },
  async begin() { events.push("begin"); },
  async persistBatch(rows) {
    events.push(`batch-${rows[0]?.id}`);
    if (rows[0]?.id === 2) throw new Error("injected staged write failure");
    return rows.length;
  },
  async commit() { events.push("commit"); return true; },
  async rollback() { events.push("rollback"); },
  async close() { events.push("session-close"); },
};
await assert.rejects(
  () => runImportSession(reader, failingSession, { batchSize: 1 }),
  /injected staged write failure/,
);
assert.deepEqual(events, [
  "inspect",
  "references",
  "validate",
  "begin",
  "batch-1",
  "batch-2",
  "rollback",
  "session-close",
  "reader-close",
]);

// Cancellation after a persisted batch follows the same rollback path.
const controller = new AbortController();
let rollbackCount = 0;
const cancelReader: ImportSourceReader<Summary, References, Row> = {
  async inspect() { return { format: "test" }; },
  async readReferenceData() { return { ok: true }; },
  async *streamRecords() {
    yield [{ id: 1 }];
    controller.abort();
    yield [{ id: 2 }];
  },
  async close() {},
};
const cancelSession: ImportSession<Summary, References, Row, number, boolean> = {
  async validateSource() { return { valid: true, issues: [] }; },
  async begin() {},
  async persistBatch(rows) { return rows.length; },
  async commit() { return true; },
  async rollback() { rollbackCount += 1; },
  async close() {},
};
await assert.rejects(
  () => runImportSession(cancelReader, cancelSession, { signal: controller.signal }),
  (error: unknown) => error instanceof Error && error.name === "AbortError",
);
assert.equal(rollbackCount, 1);

console.log("YNAB4 streaming Phase 2 coordinator/preflight tests passed");
