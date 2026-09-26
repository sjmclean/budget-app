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
        category_id TEXT,
        inflow_classification TEXT,
        transfer_account_id TEXT
      );

      CREATE TABLE local_transaction_splits (
        transaction_id TEXT NOT NULL,
        id TEXT NOT NULL,
        category_id TEXT,
        inflow_classification TEXT,
        transfer_account_id TEXT,
        amount INTEGER NOT NULL,
        PRIMARY KEY(transaction_id, id)
      );
    `);

    database.prepare(`
      INSERT INTO local_transactions (
        id, budget_id, date, amount, memo, payee_name,
        category_id, inflow_classification, transfer_account_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "cash-split-parent",
      "budget-1",
      "2026-08-13",
      -10_000,
      "Mixed purchase and card payment",
      "Mixed transaction",
      null,
      null,
      null,
    );

    const insertSplit = database.prepare(`
      INSERT INTO local_transaction_splits (
        transaction_id, id, category_id, inflow_classification,
        transfer_account_id, amount
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertSplit.run(
      "cash-split-parent",
      "groceries",
      "groceries",
      null,
      null,
      -6_000,
    );
    insertSplit.run(
      "cash-split-parent",
      "card-payment",
      null,
      null,
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
        category_id TEXT,
        inflow_classification TEXT,
        transfer_account_id TEXT
      );

      CREATE TABLE local_transaction_splits (
        transaction_id TEXT NOT NULL,
        id TEXT NOT NULL,
        category_id TEXT,
        inflow_classification TEXT,
        transfer_account_id TEXT,
        amount INTEGER NOT NULL,
        PRIMARY KEY(transaction_id, id)
      );
    `);

    database.prepare(`
      INSERT INTO local_transactions (
        id, budget_id, date, amount, memo, payee_name,
        category_id, inflow_classification, transfer_account_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "income-split-parent",
      "budget-1",
      "2026-08-14",
      10_000,
      "Mixed income and internal transfer",
      "Mixed inflow",
      null,
      null,
      null,
    );

    const insertSplit = database.prepare(`
      INSERT INTO local_transaction_splits (
        transaction_id, id, category_id, inflow_classification,
        transfer_account_id, amount
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertSplit.run(
      "income-split-parent",
      "income",
      null,
      "income",
      null,
      6_000,
    );
    insertSplit.run(
      "income-split-parent",
      "internal-transfer",
      null,
      null,
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


test("financial overview distinguishes general income, counted category income, and ordinary category inflows", () => {
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
        category_id TEXT,
        inflow_classification TEXT,
        transfer_account_id TEXT
      );

      CREATE TABLE local_transaction_splits (
        transaction_id TEXT NOT NULL,
        id TEXT NOT NULL,
        category_id TEXT,
        inflow_classification TEXT,
        transfer_account_id TEXT,
        amount INTEGER NOT NULL,
        PRIMARY KEY(transaction_id, id)
      );
    `);

    const insert = database.prepare(`
      INSERT INTO local_transactions (
        id, budget_id, date, amount, memo, payee_name,
        category_id, inflow_classification, transfer_account_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run("salary", "budget-1", "2026-08-01", 10_000, "", "Employer", null, "income", null);
    insert.run("rebate-counted", "budget-1", "2026-08-02", 2_000, "", "Rebate", "groceries", "income", null);
    insert.run("refund", "budget-1", "2026-08-03", 1_500, "", "Store", "groceries", "category-inflow", null);
    insert.run("uncategorised", "budget-1", "2026-08-04", 500, "", "Unknown", null, null, null);

    const flow = readFinancialOverviewFlow(
      <T>(sql: string, bind: readonly unknown[] = []) =>
        database.prepare(sql).all(...bind) as T[],
      "budget-1",
      "2026-08",
    );

    assert.equal(flow.generalIncome, 10_000);
    assert.equal(flow.countedCategoryIncome, 2_000);
    assert.equal(flow.income, 12_000);
    assert.equal(flow.categoryInflows, 1_500);
    assert.equal(flow.expenses, 0);
  } finally {
    database.close();
  }
});
