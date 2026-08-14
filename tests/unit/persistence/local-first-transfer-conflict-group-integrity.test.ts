import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(relativePath: string): string {
  return fs.readFileSync(
    new URL(`../../../${relativePath}`, import.meta.url),
    "utf8",
  );
}

const contracts = read(
  "apps/web/src/features/persistence/localFirst/contracts.ts",
);

const client = read(
  "apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts",
);

const worker = read(
  "apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
);

test("transaction batch worker requests can resolve conflicts per row", () => {
  const writeStart = contracts.indexOf(
    'readonly type: "writeTransactionBatch"',
  );
  const writeEnd = contracts.indexOf(
    '\n  | {',
    writeStart,
  );
  assert.ok(writeStart >= 0 && writeEnd > writeStart);

  const writeBody = contracts.slice(writeStart, writeEnd);

  assert.match(
    writeBody,
    /readonly resolveConflictId\?: string/,
    "each grouped transaction write must carry its corresponding conflict ID",
  );

  const deleteStart = contracts.indexOf(
    'readonly type: "deleteTransactionBatch"',
  );
  const deleteEnd = contracts.indexOf(
    '\n  | {',
    deleteStart,
  );
  assert.ok(deleteStart >= 0 && deleteEnd > deleteStart);

  const deleteBody = contracts.slice(deleteStart, deleteEnd);

  assert.match(
    deleteBody,
    /readonly resolveConflictId\?: string/,
    "each grouped transaction delete must carry its corresponding conflict ID",
  );
});

test("transaction batch writes resolve conflicts inside their SQLite transaction", () => {
  const start = worker.indexOf("function writeTransactionBatch(");
  const end = worker.indexOf(
    "\nfunction deleteTransaction(",
    start,
  );

  assert.ok(start >= 0 && end > start);
  const body = worker.slice(start, end);

  assert.match(
    body,
    /resolveConflictId/,
    "batch writes must carry the conflict being resolved",
  );

  assert.match(
    body,
    /resolveLocalConflictInTransaction\(resolveConflictId\)/,
    "each conflict must be resolved before the batch transaction commits",
  );

  const commit = body.indexOf('execute("COMMIT")');
  const resolve = body.indexOf(
    "resolveLocalConflictInTransaction(resolveConflictId)",
  );

  assert.ok(
    resolve >= 0 && commit > resolve,
    "conflict resolution must happen inside the same SQLite transaction as replay",
  );
});

test("transaction batch deletes resolve conflicts inside their SQLite transaction", () => {
  const start = worker.indexOf("function deleteTransactionBatch(");
  const end = worker.indexOf(
    "\nfunction writeTransactionAttachment(",
    start,
  );

  assert.ok(start >= 0 && end > start);
  const body = worker.slice(start, end);

  assert.match(
    body,
    /resolveConflictId/,
    "batch deletes must carry the conflict being resolved",
  );

  assert.match(
    body,
    /resolveLocalConflictInTransaction\(resolveConflictId\)/,
    "each delete conflict must be resolved before the batch transaction commits",
  );

  const commit = body.indexOf('execute("COMMIT")');
  const resolve = body.indexOf(
    "resolveLocalConflictInTransaction(resolveConflictId)",
  );

  assert.ok(
    resolve >= 0 && commit > resolve,
    "delete conflict resolution must be atomic with replay",
  );
});

test("keep-local finds the complete unresolved transfer operation group", () => {
  assert.match(
    client,
    /operationGroupId/,
    "transfer conflict replay must inspect logical operation groups",
  );

  assert.match(
    client,
    /listSyncConflicts\("unresolved",\s*500\)/,
    "resolution must inspect unresolved conflicts before replay",
  );

  assert.match(
    client,
    /\.filter\([\s\S]*operationGroupId/,
    "resolution must collect every unresolved conflict in the same operation group",
  );
});

test("keep-local refuses incomplete grouped transfer operation snapshots", () => {
  assert.match(
    client,
    /complete transfer operation snapshot/i,
    "keep-local must require both financial members in the durable operation snapshot",
  );
});

test("keep-local validates reciprocal grouped transfer upserts", () => {
  assert.match(
    client,
    /transferTransactionId/,
    "paired replay must validate reciprocal transaction IDs",
  );

  assert.match(
    client,
    /transferAccountId/,
    "paired replay must validate reciprocal accounts",
  );

  assert.match(
    client,
    /amount/,
    "paired replay must validate equal-and-opposite amounts",
  );
});

test("keep-local replays both grouped upsert conflicts in one worker batch", () => {
  assert.match(
    client,
    /writeTransactionBatch\(/,
    "grouped upserts must use the atomic worker batch",
  );

  assert.match(
    client,
    /resolveConflictId:\s*conflict\?\.conflictId/,
    "each replayed leg must resolve its corresponding conflict inside that batch",
  );
});

test("keep-local replays both grouped delete conflicts in one worker batch", () => {
  assert.match(
    client,
    /deleteTransactionBatch\(/,
    "grouped deletes must use the atomic worker batch",
  );

  assert.match(
    client,
    /resolveConflictId:\s*conflict\?\.conflictId/,
    "each replayed delete must resolve its corresponding conflict inside that batch",
  );
});

test("legacy ungrouped transfer conflicts remain safely blocked", () => {
  assert.match(
    client,
    /transfer conflict cannot be kept locally/i,
    "old transfer conflicts without grouping must remain safely non-replayable",
  );
});

test("atomic keep-local requires every conflict to still be unresolved", () => {
  const start = worker.indexOf(
    "function resolveLocalConflictInTransaction(",
  );
  const end = worker.indexOf(
    "\nfunction insertOutbox(",
    start,
  );

  assert.ok(start >= 0 && end > start);
  const body = worker.slice(start, end);

  const statusRead = body.indexOf("SELECT status");
  const statusCheck = body.indexOf(
    'row.status !== "unresolved"',
  );
  const update = body.indexOf(
    "UPDATE local_budget_sync_conflicts",
  );

  assert.ok(
    statusRead >= 0 &&
      statusCheck > statusRead &&
      update > statusCheck,
    "conflict status must be proven unresolved before changing it",
  );
});

test("one conflicted transfer leg retains the complete losing operation", () => {
  assert.match(
    contracts,
    /readonly operationGroup\?:/,
    "a grouped mutation must durably retain its complete logical operation",
  );

  assert.match(
    contracts,
    /readonly members:/,
    "the grouped operation snapshot must contain every logical member",
  );

  assert.match(
    client,
    /losingMutation\.operationGroup/,
    "keep-local must be able to reconstruct the pair from one losing conflict",
  );
});

test("keep-local does not require both transfer legs to have conflict rows", () => {
  const start = client.indexOf(
    "async function replayGroupedTransferConflicts(",
  );
  const end = client.indexOf(
    "\n  async function replayConflictMutation(",
    start,
  );

  assert.ok(start >= 0 && end > start);
  const body = client.slice(start, end);

  assert.doesNotMatch(
    body,
    /groupedConflicts\.length !== 2/,
    "a valid transfer may have only one genuinely conflicted entity",
  );

  assert.match(
    body,
    /operationGroup\.members/,
    "the full losing operation must come from durable grouped mutation metadata",
  );
});
