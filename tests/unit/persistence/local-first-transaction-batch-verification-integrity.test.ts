import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

const registerClient = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts",
    import.meta.url,
  ),
  "utf8",
);

test("transaction batch verification occurs before SQLite COMMIT and is covered by ROLLBACK", () => {
  const start = worker.indexOf("function writeTransactionBatch(");
  const end = worker.indexOf("\nfunction deleteTransaction(", start);

  assert.ok(start >= 0, "writeTransactionBatch must exist");
  assert.ok(end > start, "writeTransactionBatch boundary must be discoverable");

  const batch = worker.slice(start, end);

  const begin = batch.indexOf('execute("BEGIN IMMEDIATE")');
  const verification = batch.indexOf("if (verifyWrittenTransactions)");
  const verificationFailure = batch.indexOf(
    '"TRANSACTION_BATCH_VERIFICATION_FAILED"',
  );
  const commit = batch.indexOf('execute("COMMIT")');
  const rollback = batch.indexOf('execute("ROLLBACK")');

  assert.ok(begin >= 0, "batch must begin a SQLite transaction");
  assert.ok(
    verification > begin,
    "verification must occur after BEGIN IMMEDIATE",
  );
  assert.ok(
    verificationFailure > verification,
    "verification must have an explicit failure path",
  );
  assert.ok(
    commit > verificationFailure,
    "COMMIT must occur only after verification succeeds",
  );
  assert.ok(
    rollback > commit,
    "the batch catch path must rollback a verification failure",
  );
});

test("transaction batch verification reads physical SQLite values without reference hydration", () => {
  const helperStart = worker.indexOf(
    "function getPersistedTransactionForVerification(",
  );
  const helperEnd = worker.indexOf(
    "\nfunction getTransactionsByIds(",
    helperStart,
  );

  assert.ok(helperStart >= 0, "physical verification reader must exist");
  assert.ok(
    helperEnd > helperStart,
    "physical verification reader boundary must be discoverable",
  );

  const helper = worker.slice(helperStart, helperEnd);

  assert.match(
    helper,
    /FROM local_transactions/,
    "verification must read the physical transaction table",
  );
  assert.match(
    helper,
    /FROM local_transaction_splits/,
    "verification must read physical split rows",
  );
  assert.match(
    helper,
    /FROM local_transaction_tags/,
    "verification must read physical tag rows",
  );

  assert.match(
    helper,
    /FROM local_transaction_import_provenance/,
    "verification must read physical import provenance rows",
  );

  assert.doesNotMatch(
    helper,
    /JOIN local_categories|COALESCE\s*\(/,
    "verification must not hydrate category names from reference tables",
  );

  const batchStart = worker.indexOf("function writeTransactionBatch(");
  const batchEnd = worker.indexOf("\nfunction deleteTransaction(", batchStart);
  const batch = worker.slice(batchStart, batchEnd);

  assert.match(
    batch,
    /getPersistedTransactionForVerification\(/,
    "transactional verification must use the physical persistence reader",
  );

  assert.match(
    batch,
    /importProvenance:\s*\[\.\.\.transaction\.importProvenance\]/,
    "transactional verification must compare import provenance before COMMIT",
  );
});

test("transaction upsert replaces transaction-owned import provenance atomically", () => {
  const start = worker.indexOf("function upsertTransaction(");
  const end = worker.indexOf(
    "\nfunction assertActiveStagedImport(",
    start,
  );

  assert.ok(start >= 0, "upsertTransaction must exist");
  assert.ok(end > start, "upsertTransaction boundary must be discoverable");

  const upsert = worker.slice(start, end);

  const deleteProvenance = upsert.indexOf(
    "DELETE FROM local_transaction_import_provenance",
  );
  const insertProvenance = upsert.indexOf(
    "INSERT INTO local_transaction_import_provenance",
  );

  assert.ok(
    deleteProvenance >= 0,
    "transaction upsert must clear previous provenance",
  );
  assert.ok(
    insertProvenance > deleteProvenance,
    "transaction upsert must rewrite the complete provenance collection",
  );
  assert.match(
    upsert,
    /for \(const provenance of transaction\.importProvenance\)/,
    "provenance persistence must come from the transaction record itself",
  );
});

test("register batch commits request transactional persisted-record verification", () => {
  const start = registerClient.indexOf("async commitTransactionBatch(input)");
  const end = registerClient.indexOf("\n    async moveTransactions(", start);

  assert.ok(start >= 0, "commitTransactionBatch must exist");
  assert.ok(end > start, "commitTransactionBatch boundary must be discoverable");

  const commit = registerClient.slice(start, end);

  assert.match(
    commit,
    /writeTransactionBatch\(writes,\s*\{\s*requireAbsentTransactionIds,\s*verifyWrittenTransactions:\s*true,/s,
    "register/import batch commits must enable verification before SQLite commit",
  );
});
