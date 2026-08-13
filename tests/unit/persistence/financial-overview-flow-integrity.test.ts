import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import { readFinancialOverviewFlow } from "../../../apps/web/src/features/persistence/localFirst/financialOverviewFlow.js";

test("financial overview excludes transfer portions of split transactions", () => {
  const database = new Database(":memory:");

  try {
    database.exec(`
      CREATE TABLE local_transactions (
        id TEXT PRIMARY KEY,
        budget_id TEXT NOT NULL,
        date TEXT NOT NULL,
        amount INTEGER NOT NULL,
        memo TEXT,
        payee_name TEXT,
        transfer_account_id TEXT
      );

      CREATE TABLE local_transaction_splits (
        transaction_id TEXT NOT NULL,
        id TEXT NOT NULL,
        transfer_account_id TEXT,
        amount INTEGER NOT NULL,
        PRIMARY KEY(transaction_id, id)
      );
    `);

    database.prepare(`
      INSERT INTO local_transactions (
        id, budget_id, date, amount, memo, payee_name, transfer_account_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      "cash-split-parent",
      "budget-1",
      "2026-08-13",
      -10_000,
      "Mixed purchase and card payment",
      "Mixed transaction",
      null,
    );

    const insertSplit = database.prepare(`
      INSERT INTO local_transaction_splits (
        transaction_id, id, transfer_account_id, amount
      ) VALUES (?, ?, ?, ?)
    `);

    insertSplit.run(
      "cash-split-parent",
      "groceries",
      null,
      -6_000,
    );
    insertSplit.run(
      "cash-split-parent",
      "card-payment",
      "credit-card",
      -4_000,
    );

    const flow = readFinancialOverviewFlow(
      <T>(sql: string, bind: readonly unknown[] = []) =>
        database.prepare(sql).all(...bind) as T[],
      "budget-1",
      "2026-08",
    );

    assert.equal(
      flow.expenses,
      6_000,
      "only the non-transfer $60 split is an expense",
    );
    assert.equal(flow.income, 0);
  } finally {
    database.close();
  }
});

test("financial overview excludes transfer portions of split inflows", () => {
  const database = new Database(":memory:");

  try {
    database.exec(`
      CREATE TABLE local_transactions (
        id TEXT PRIMARY KEY,
        budget_id TEXT NOT NULL,
        date TEXT NOT NULL,
        amount INTEGER NOT NULL,
        memo TEXT,
        payee_name TEXT,
        transfer_account_id TEXT
      );

      CREATE TABLE local_transaction_splits (
        transaction_id TEXT NOT NULL,
        id TEXT NOT NULL,
        transfer_account_id TEXT,
        amount INTEGER NOT NULL,
        PRIMARY KEY(transaction_id, id)
      );
    `);

    database.prepare(`
      INSERT INTO local_transactions (
        id, budget_id, date, amount, memo, payee_name, transfer_account_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      "income-split-parent",
      "budget-1",
      "2026-08-14",
      10_000,
      "Mixed income and internal transfer",
      "Mixed inflow",
      null,
    );

    const insertSplit = database.prepare(`
      INSERT INTO local_transaction_splits (
        transaction_id, id, transfer_account_id, amount
      ) VALUES (?, ?, ?, ?)
    `);

    insertSplit.run(
      "income-split-parent",
      "income",
      null,
      6_000,
    );
    insertSplit.run(
      "income-split-parent",
      "internal-transfer",
      "savings",
      4_000,
    );

    const flow = readFinancialOverviewFlow(
      <T>(sql: string, bind: readonly unknown[] = []) =>
        database.prepare(sql).all(...bind) as T[],
      "budget-1",
      "2026-08",
    );

    assert.equal(
      flow.income,
      6_000,
      "only the non-transfer $60 split is income",
    );
    assert.equal(flow.expenses, 0);
  } finally {
    database.close();
  }
});
