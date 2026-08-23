import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Database from "better-sqlite3";
import {
  LOCAL_REGISTER_SCHEMA_SQL,
  LOCAL_TRANSACTION_UPSERT_SQL,
  localTransactionUpsertBindings,
  type LocalTransactionRecord,
  type TransactionHistorySnapshot,
} from "../../../apps/web/src/features/persistence/localFirst/registerSchema.ts";
import { transactionHistorySnapshotsEqual } from "../../../apps/web/src/features/persistence/localFirst/transactionHistorySnapshot.ts";

const budgetId = "budget-history";
const bytes = Uint8Array.from([0, 1, 2, 127, 255]);

function transaction(id: string, accountId: string, amount: number, partnerId: string): LocalTransactionRecord {
  return {
    id, budgetId, accountId, date: "2026-08-19", amount,
    memo: `memo-${id}`, checkNumber: "42", clearedStatus: "cleared",
    payeeId: "payee-1", payeeName: "Transfer", rawPayeeName: "RAW TRANSFER",
    categoryId: null, categoryName: null,
    transferAccountId: accountId === "account-a" ? "account-b" : "account-a",
    transferTransactionId: partnerId,
    generatedFromSchedule: true, scheduledTransactionId: "schedule-1",
    scheduledOccurrenceDate: "2026-08-19",
    splitLines: id === "transaction-a" ? [{
      id: "split-1", categoryId: "category-1", categoryName: "Groceries",
      transferAccountId: null, transferTransactionId: null, memo: "split memo", amount: -250,
    }] : [],
    tagIds: id === "transaction-a" ? ["tag-2", "tag-1"] : [],
    importProvenance: id === "transaction-a" ? [{
      fileType: "ofx", identity: "bank-source-id", occurrence: 2,
      importedAt: "2026-08-20T00:00:00.000Z",
    }] : [],
    updatedAt: "2026-08-20T01:02:03.000Z",
  };
}

function openDatabase() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(LOCAL_REGISTER_SCHEMA_SQL);
  for (const id of ["account-a", "account-b"]) db.prepare(
    `INSERT INTO local_accounts(id,budget_id,name,type,participation,opening_balance,currency_code,created_at)
     VALUES(?,?,?,?,?,?,?,?)`,
  ).run(id, budgetId, id, "checking", "budget", 0, "AUD", "2026-01-01");
  return db;
}

function writeTransaction(db: Database.Database, value: LocalTransactionRecord) {
  db.prepare(LOCAL_TRANSACTION_UPSERT_SQL).run(...localTransactionUpsertBindings(value));
  for (const split of value.splitLines) db.prepare(
    `INSERT INTO local_transaction_splits(transaction_id,id,category_id,category_name,transfer_account_id,transfer_transaction_id,memo,amount)
     VALUES(?,?,?,?,?,?,?,?)`,
  ).run(value.id, split.id, split.categoryId, split.categoryName, split.transferAccountId, split.transferTransactionId, split.memo, split.amount);
  for (const tagId of value.tagIds) db.prepare("INSERT INTO local_transaction_tags VALUES(?,?)").run(value.id, tagId);
  for (const provenance of value.importProvenance) db.prepare(
    "INSERT INTO local_transaction_import_provenance VALUES(?,?,?,?,?)",
  ).run(value.id, provenance.fileType, provenance.identity, provenance.occurrence, provenance.importedAt);
}

function capture(db: Database.Database): TransactionHistorySnapshot {
  const rows = db.prepare("SELECT id FROM local_transactions WHERE budget_id = ? ORDER BY id").all(budgetId) as { id: string }[];
  const transactions = rows.map(({ id }) => {
    const row = db.prepare(`SELECT id,budget_id AS budgetId,account_id AS accountId,date,amount,memo,
      check_number AS checkNumber,cleared_status AS clearedStatus,payee_id AS payeeId,payee_name AS payeeName,
      raw_payee_name AS rawPayeeName,category_id AS categoryId,category_name AS categoryName,
      transfer_account_id AS transferAccountId,transfer_transaction_id AS transferTransactionId,
      generated_from_schedule AS generatedFromSchedule,scheduled_transaction_id AS scheduledTransactionId,
      scheduled_occurrence_date AS scheduledOccurrenceDate,updated_at AS updatedAt FROM local_transactions WHERE id=?`).get(id) as any;
    row.generatedFromSchedule = Boolean(row.generatedFromSchedule);
    row.splitLines = db.prepare(`SELECT id,category_id AS categoryId,category_name AS categoryName,
      transfer_account_id AS transferAccountId,transfer_transaction_id AS transferTransactionId,memo,amount
      FROM local_transaction_splits WHERE transaction_id=? ORDER BY id`).all(id);
    row.tagIds = (db.prepare("SELECT tag_id AS tagId FROM local_transaction_tags WHERE transaction_id=? ORDER BY tag_id").all(id) as any[]).map(({ tagId }) => tagId);
    row.importProvenance = db.prepare(`SELECT file_type AS fileType,identity,occurrence,imported_at AS importedAt
      FROM local_transaction_import_provenance WHERE transaction_id=? ORDER BY file_type,identity,occurrence`).all(id);
    return row as LocalTransactionRecord;
  });
  const attachments = (db.prepare(`SELECT id,budget_id AS budgetId,transaction_id AS transactionId,file_name AS fileName,
    file_size AS fileSize,mime_type AS mimeType,attached_at AS attachedAt,content_hash AS contentHash,content
    FROM local_transaction_attachments ORDER BY transaction_id,id`).all() as any[])
    .map((row) => ({ ...row, content: Uint8Array.from(row.content) }));
  return { budgetId, transactions, attachments };
}

function restore(db: Database.Database, snapshot: TransactionHistorySnapshot, fail = false) {
  db.transaction(() => {
    for (const value of snapshot.transactions) writeTransaction(db, value);
    for (const attachment of snapshot.attachments) {
      db.prepare(`INSERT INTO local_transaction_attachments
        (id,budget_id,transaction_id,file_name,file_size,mime_type,attached_at,content_hash,content)
        VALUES(?,?,?,?,?,?,?,?,?)`).run(attachment.id, attachment.budgetId, attachment.transactionId,
          attachment.fileName, attachment.fileSize, attachment.mimeType, attachment.attachedAt,
          attachment.contentHash, Buffer.from(attachment.content));
    }
    if (fail) throw new Error("forced restore failure");
  })();
}

test("physical SQLite capture, cascade delete and exact graph restore", () => {
  const db = openDatabase();
  try {
    writeTransaction(db, transaction("transaction-a", "account-a", -1000, "transaction-b"));
    writeTransaction(db, transaction("transaction-b", "account-b", 1000, "transaction-a"));
    db.prepare(`INSERT INTO local_transaction_attachments VALUES(?,?,?,?,?,?,?,?,?)`).run(
      "attachment-1", budgetId, "transaction-a", "receipt.bin", bytes.length,
      "application/octet-stream", "2026-08-20T02:00:00.000Z", "sha256:test", Buffer.from(bytes),
    );
    const before = capture(db);
    assert.equal(before.transactions.length, 2);
    assert.deepEqual(Array.from(before.attachments[0].content), Array.from(bytes));

    db.transaction(() => {
      db.prepare("DELETE FROM local_transactions WHERE budget_id=? AND id IN (?,?)")
        .run(budgetId, "transaction-a", "transaction-b");
    })();
    assert.equal(db.prepare("SELECT count(*) AS count FROM local_transaction_splits").get().count, 0);
    assert.equal(db.prepare("SELECT count(*) AS count FROM local_transaction_tags").get().count, 0);
    assert.equal(db.prepare("SELECT count(*) AS count FROM local_transaction_import_provenance").get().count, 0);
    assert.equal(db.prepare("SELECT count(*) AS count FROM local_transaction_attachments").get().count, 0);

    restore(db, before);
    assert.equal(transactionHistorySnapshotsEqual(capture(db), before), true);
    assert.throws(() => restore(db, before), /UNIQUE constraint failed/);
    assert.equal(db.prepare("SELECT count(*) AS count FROM local_transactions").get().count, 2);
  } finally { db.close(); }
});

test("plain transaction capture and restore preserves its stable ID and fields", () => {
  const db = openDatabase();
  try {
    const plain: LocalTransactionRecord = {
      ...transaction("plain-transaction", "account-a", -321, "unused"),
      transferAccountId: null,
      transferTransactionId: null,
      generatedFromSchedule: false,
      scheduledTransactionId: null,
      scheduledOccurrenceDate: null,
      splitLines: [],
      tagIds: [],
      importProvenance: [],
    };
    writeTransaction(db, plain);
    const before = capture(db);
    db.prepare("DELETE FROM local_transactions WHERE id=?").run(plain.id);
    restore(db, before);
    assert.equal(transactionHistorySnapshotsEqual(capture(db), before), true);
    assert.equal((db.prepare("SELECT id FROM local_transactions").get() as { id: string }).id, plain.id);
  } finally { db.close(); }
});

test("physical SQLite restore failure rolls back the whole graph", () => {
  const source = openDatabase();
  const target = openDatabase();
  try {
    writeTransaction(source, transaction("transaction-a", "account-a", -1000, "transaction-b"));
    writeTransaction(source, transaction("transaction-b", "account-b", 1000, "transaction-a"));
    const snapshot = capture(source);
    assert.throws(() => restore(target, snapshot, true), /forced restore failure/);
    assert.equal(target.prepare("SELECT count(*) AS count FROM local_transactions").get().count, 0);
  } finally { source.close(); target.close(); }
});

test("worker snapshot operations use one authoritative transaction and readback", () => {
  const source = readFileSync(new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ), "utf8");
  const restoreSource = source.slice(source.indexOf("function restoreTransactionHistorySnapshot("), source.indexOf("function deleteTransactionHistorySnapshot("));
  assert.match(restoreSource, /execute\("BEGIN IMMEDIATE"\)/);
  assert.match(restoreSource, /captureTransactionHistorySnapshots/);
  assert.match(restoreSource, /transactionHistorySnapshotsEqual/);
  assert.match(restoreSource, /execute\("COMMIT"\)/);
  assert.match(restoreSource, /execute\("ROLLBACK"\)/);
});
