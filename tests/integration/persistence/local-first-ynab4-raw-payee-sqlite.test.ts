import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import Database from "better-sqlite3";

import {
  LOCAL_REGISTER_SCHEMA_SQL,
  LOCAL_TRANSACTION_UPSERT_SQL,
  localTransactionUpsertBindings,
  type LocalTransactionRecord,
} from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";

test("local-first worker SQLite contract persists and reloads raw bank payee", () => {
  const directory = mkdtempSync(join(tmpdir(), "budget-app-raw-payee-"));
  const databasePath = join(directory, "provenance.sqlite");
  const expectedRawPayee = "LOCAL SHOP 0421 MELBOURNE";
  const transaction: LocalTransactionRecord = {
    id: "txn-provenance",
    budgetId: "budget-provenance",
    accountId: "checking",
    date: "2026-08-13",
    amount: -1234,
    memo: "Card ending 4242",
    checkNumber: null,
    clearedStatus: "cleared",
    payeeId: null,
    payeeName: "Local Shop",
    rawPayeeName: expectedRawPayee,
    categoryId: "groceries",
    categoryName: "Groceries",
    transferAccountId: null,
    transferTransactionId: null,
    generatedFromSchedule: false,
    scheduledTransactionId: null,
    scheduledOccurrenceDate: null,
    splitLines: [],
    tagIds: [],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };

  try {
    const database = new Database(databasePath);
    database.exec(LOCAL_REGISTER_SCHEMA_SQL);
    database.prepare(
      `INSERT INTO local_accounts(
         id, budget_id, name, type, participation, opening_balance,
         currency_code, created_at, closed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "checking",
      "budget-provenance",
      "Everyday",
      "checking",
      "budget",
      0,
      "AUD",
      "2026-08-14T00:00:00.000Z",
      null,
    );
    database.prepare(LOCAL_TRANSACTION_UPSERT_SQL).run(
      ...localTransactionUpsertBindings(transaction),
    );
    database.close();

    const reopened = new Database(databasePath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      const row = reopened.prepare(
        `SELECT raw_payee_name AS rawPayee
           FROM local_transactions
          WHERE budget_id = ? AND id = ?`,
      ).get("budget-provenance", "txn-provenance") as
        | { rawPayee: string | null }
        | undefined;

      assert.equal(row?.rawPayee, expectedRawPayee);
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
