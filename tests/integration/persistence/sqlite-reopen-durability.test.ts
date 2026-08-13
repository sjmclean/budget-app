import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";

import { createDatabase } from "../../../packages/database/src/db.js";
import { SqliteBudgetRepository } from "../../../packages/repository/src/SqliteBudgetRepository.js";
import { SqliteAccountRepository } from "../../../packages/repository/src/SqliteAccountRepository.js";
import { SqliteTransactionRepository } from "../../../packages/repository/src/SqliteTransactionRepository.js";

import {
  buildAccount,
  buildBudget,
  buildTransaction,
} from "../../support/builders/domainBuilders.js";

function closeDatabase(db: unknown): void {
  const client = (db as { $client?: { close?: () => void } }).$client;
  client?.close?.();
}

describe("SQLite reopen durability", () => {
  it("preserves committed budget, account, and transaction state across reopen", async () => {
    const directory = mkdtempSync(join(tmpdir(), "budget-app-reopen-"));
    const databasePath = join(directory, "durability.budget");

    try {
      const first = createDatabase(databasePath);

      const budgets = new SqliteBudgetRepository(first);
      const accounts = new SqliteAccountRepository(first);
      const transactions = new SqliteTransactionRepository(first);

      const budget = buildBudget("Durability Budget");
      const account = buildAccount(budget.id, {
        name: "Everyday",
        openingBalance: 50_000,
      });
      const transaction = buildTransaction(
        {
          budgetId: budget.id,
          accountId: account.id,
        },
        {
          date: "2026-08-13",
          amount: -12_345,
          memo: "Must survive reopen",
        },
      );

      await budgets.create(budget);
      await accounts.create(account);
      await transactions.create(transaction);

      assert.equal(
        (await transactions.getById(transaction.id))?.memo,
        "Must survive reopen",
      );

      closeDatabase(first);

      const reopened = createDatabase(databasePath);
      try {
        const reopenedTransactions =
          new SqliteTransactionRepository(reopened);

        const persisted =
          await reopenedTransactions.getById(transaction.id);

        assert.ok(persisted);
        assert.equal(persisted.budgetId, budget.id);
        assert.equal(persisted.accountId, account.id);
        assert.equal(persisted.amount, -12_345);
        assert.equal(persisted.memo, "Must survive reopen");
      } finally {
        closeDatabase(reopened);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
