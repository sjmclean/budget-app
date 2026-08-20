import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import {
  readImportedTransactionSourceOccurrences,
} from "../../../apps/web/src/features/persistence/localFirst/importedTransactionSourceOccurrences.js";
import {
  LOCAL_REGISTER_SCHEMA_SQL,
} from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";

function insertAccount(
  database: Database.Database,
  id: string,
  budgetId: string,
) {
  database.prepare(`
    INSERT INTO local_accounts(
      id,
      budget_id,
      name,
      type,
      participation,
      opening_balance,
      currency_code,
      created_at,
      closed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    budgetId,
    id,
    "checking",
    "budget",
    0,
    "AUD",
    "2026-08-20T00:00:00.000Z",
    null,
  );
}

function insertTransaction(
  database: Database.Database,
  id: string,
  budgetId: string,
  accountId: string,
) {
  database.prepare(`
    INSERT INTO local_transactions(
      id,
      budget_id,
      account_id,
      date,
      amount,
      memo,
      check_number,
      cleared_status,
      payee_id,
      payee_name,
      raw_payee_name,
      category_id,
      category_name,
      transfer_account_id,
      transfer_transaction_id,
      generated_from_schedule,
      scheduled_transaction_id,
      scheduled_occurrence_date,
      updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    id,
    budgetId,
    accountId,
    "2026-08-20",
    -100,
    null,
    null,
    "uncleared",
    null,
    "Merchant",
    "Merchant",
    null,
    null,
    null,
    null,
    0,
    null,
    null,
    "2026-08-20T00:00:00.000Z",
  );
}

function insertProvenance(
  database: Database.Database,
  transactionId: string,
  fileType: "csv" | "qif" | "ofx" | "qfx",
  identity: string,
  occurrence: number,
) {
  database.prepare(`
    INSERT INTO local_transaction_import_provenance(
      transaction_id,
      file_type,
      identity,
      occurrence,
      imported_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    transactionId,
    fileType,
    identity,
    occurrence,
    "2026-08-20T00:00:00.000Z",
  );
}

test("source occurrence query uses maximum durable ordinal and isolates account and file type", () => {
  const database = new Database(":memory:");

  try {
    database.pragma("foreign_keys = ON");
    database.exec(LOCAL_REGISTER_SCHEMA_SQL);

    insertAccount(database, "checking", "budget-1");
    insertAccount(database, "savings", "budget-1");
    insertAccount(database, "other-budget-account", "budget-2");

    insertTransaction(
      database,
      "checking-occurrence-1",
      "budget-1",
      "checking",
    );
    insertTransaction(
      database,
      "checking-occurrence-3",
      "budget-1",
      "checking",
    );
    insertTransaction(
      database,
      "checking-other-file-type",
      "budget-1",
      "checking",
    );
    insertTransaction(
      database,
      "savings-occurrence-9",
      "budget-1",
      "savings",
    );
    insertTransaction(
      database,
      "other-budget-occurrence-12",
      "budget-2",
      "other-budget-account",
    );

    const identity = "csv:external:shared-bank-id";

    insertProvenance(
      database,
      "checking-occurrence-1",
      "csv",
      identity,
      1,
    );
    insertProvenance(
      database,
      "checking-occurrence-3",
      "csv",
      identity,
      3,
    );

    // Same identity, same account, different file type: must not affect CSV.
    insertProvenance(
      database,
      "checking-other-file-type",
      "qif",
      identity,
      8,
    );

    // Same identity and file type, different account: must not affect Checking.
    insertProvenance(
      database,
      "savings-occurrence-9",
      "csv",
      identity,
      9,
    );

    // Same identity/file type, different budget: must not affect budget-1.
    insertProvenance(
      database,
      "other-budget-occurrence-12",
      "csv",
      identity,
      12,
    );

    insertTransaction(
      database,
      "checking-other-identity",
      "budget-1",
      "checking",
    );
    insertProvenance(
      database,
      "checking-other-identity",
      "csv",
      "csv:external:second-bank-id",
      2,
    );

    const query = <T>(
      sql: string,
      bind: readonly unknown[] = [],
    ): T[] => database.prepare(sql).all(...bind) as T[];

    const checkingCsv = readImportedTransactionSourceOccurrences(
      query,
      "budget-1",
      "checking",
      "csv",
    );

    assert.deepEqual(checkingCsv, [
      {
        identity: "csv:external:second-bank-id",
        occurrenceCount: 2,
      },
      {
        identity,
        occurrenceCount: 3,
      },
    ]);

    assert.equal(
      checkingCsv.find((row) => row.identity === identity)
        ?.occurrenceCount,
      3,
      "two durable rows at occurrences 1 and 3 must aggregate to MAX=3, not COUNT=2",
    );

    assert.deepEqual(
      readImportedTransactionSourceOccurrences(
        query,
        "budget-1",
        "checking",
        "qif",
      ),
      [{ identity, occurrenceCount: 8 }],
      "file type must be isolated",
    );

    assert.deepEqual(
      readImportedTransactionSourceOccurrences(
        query,
        "budget-1",
        "savings",
        "csv",
      ),
      [{ identity, occurrenceCount: 9 }],
      "account must be isolated",
    );

    assert.deepEqual(
      readImportedTransactionSourceOccurrences(
        query,
        "budget-2",
        "other-budget-account",
        "csv",
      ),
      [{ identity, occurrenceCount: 12 }],
      "budget must also be isolated",
    );
  } finally {
    database.close();
  }
});
