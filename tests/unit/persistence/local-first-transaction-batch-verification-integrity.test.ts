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

test("atomic import batch covers payee creation and verified transaction persistence with one SQLite rollback boundary", () => {
  const helperStart = worker.indexOf(
    "function applyTransactionBatchInCurrentTransaction(",
  );
  const helperEnd = worker.indexOf(
    "\nfunction writeTransactionBatch(",
    helperStart,
  );

  assert.ok(
    helperStart >= 0,
    "transaction-neutral batch helper must exist",
  );
  assert.ok(
    helperEnd > helperStart,
    "transaction-neutral batch helper boundary must be discoverable",
  );

  const helper = worker.slice(helperStart, helperEnd);

  assert.match(
    helper,
    /if \(!verifyWrittenTransactions\) return;/,
    "the shared transaction helper must retain physical verification",
  );
  assert.match(
    helper,
    /TRANSACTION_BATCH_VERIFICATION_FAILED/,
    "the shared transaction helper must retain an explicit verification failure path",
  );

  const start = worker.indexOf("function writeImportBatch(");
  const end = worker.indexOf("\nfunction deleteTransaction(", start);

  assert.ok(start >= 0, "writeImportBatch must exist");
  assert.ok(end > start, "writeImportBatch boundary must be discoverable");

  const batch = worker.slice(start, end);

  const begin = batch.indexOf('execute("BEGIN IMMEDIATE")');
  const payeeInsert = batch.indexOf("INSERT INTO local_payees");
  const transactionApply = batch.indexOf(
    "applyTransactionBatchInCurrentTransaction(",
  );
  const payeeVerification = batch.indexOf(
    '"IMPORT_PAYEE_VERIFICATION_FAILED"',
  );
  const revision = batch.indexOf(
    'writeMetadata(\n      "localRevision"',
  );
  const commit = batch.indexOf('execute("COMMIT")');
  const rollback = batch.indexOf('execute("ROLLBACK")');

  assert.ok(begin >= 0, "import batch must begin one SQLite transaction");
  assert.ok(
    payeeInsert > begin,
    "staged payees must be inserted after BEGIN IMMEDIATE",
  );
  assert.ok(
    transactionApply > payeeInsert,
    "transaction/provenance writes must run after staged payee creation inside the same transaction",
  );
  assert.ok(
    payeeVerification > transactionApply,
    "staged payee verification must occur after transaction persistence",
  );
  assert.ok(
    revision > payeeVerification,
    "local revision must advance only after both persistence domains verify",
  );
  assert.ok(
    commit > revision,
    "COMMIT must occur only after all writes and verification succeed",
  );
  assert.ok(
    rollback > commit,
    "the import batch catch path must rollback failures from the shared transaction",
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

  const transactionHelperStart = worker.indexOf(
    "function applyTransactionBatchInCurrentTransaction(",
  );
  const transactionHelperEnd = worker.indexOf(
    "\nfunction writeTransactionBatch(",
    transactionHelperStart,
  );
  const transactionHelper = worker.slice(
    transactionHelperStart,
    transactionHelperEnd,
  );

  assert.match(
    transactionHelper,
    /getPersistedTransactionForVerification\(/,
    "transactional verification must use the physical persistence reader",
  );

  assert.match(
    transactionHelper,
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

test("dedicated import commits request physical verification through the atomic import worker operation", () => {
  const start = registerClient.indexOf("async commitImportBatch(input)");
  const end = registerClient.indexOf(
    "\n    async moveTransactions(",
    start,
  );

  assert.ok(start >= 0, "commitImportBatch must exist");
  assert.ok(end > start, "commitImportBatch boundary must be discoverable");

  const commit = registerClient.slice(start, end);

  assert.match(
    commit,
    /writeImportBatch\(\s*payeeWrites,\s*writes,\s*\{[\s\S]*?requireAbsentTransactionIds,[\s\S]*?verifyWrittenTransactions:\s*true,/,
    "import commits must enable physical verification before the atomic worker commit",
  );
});
