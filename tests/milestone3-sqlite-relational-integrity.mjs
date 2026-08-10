import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createBudgetEngineStore } from "../apps/server/src/budgetEngineStore.mjs";
import { createBudgetImportStore } from "../apps/server/src/budgetImportStore.mjs";

const database = new Database(":memory:");
const engine = createBudgetEngineStore(database);
const imports = createBudgetImportStore(database, engine);

function begin(budgetId) {
  const session = imports.begin({ budgetId, budgetName: budgetId, currency: "AUD" });
  imports.persistReferenceData(session.generationId, {
    accounts: [
      { id: "checking", name: "Checking", type: "checking", participation: "on-budget", openingBalance: 0, closedAt: null },
      { id: "savings", name: "Savings", type: "savings", participation: "on-budget", openingBalance: 0, closedAt: "2025-01-01T00:00:00.000Z" },
    ],
    payees: [],
    categories: [],
  });
  return session;
}

function row(overrides) {
  return {
    id: "row",
    accountId: "checking",
    payeeId: null,
    categoryId: null,
    transferAccountId: null,
    transferTransactionId: null,
    splitLines: [],
    type: "standard",
    date: "2025-01-01",
    memo: null,
    checkNumber: null,
    amount: 0,
    clearedStatus: "uncleared",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

const valid = begin("valid-relations");
imports.persistTransactions(valid.generationId, [
  row({
    id: "direct-a",
    accountId: "checking",
    transferAccountId: "savings",
    transferTransactionId: "direct-b",
    type: "transfer",
    amount: -100,
  }),
  row({
    id: "direct-b",
    accountId: "savings",
    transferAccountId: "checking",
    transferTransactionId: "direct-a",
    type: "transfer",
    amount: 100,
  }),
  row({
    id: "split-parent",
    accountId: "checking",
    type: "split",
    amount: -250,
    splitLines: [{
      id: "split-line",
      categoryId: null,
      transferAccountId: "savings",
      transferTransactionId: "split-reciprocal",
      memo: null,
      amount: -250,
    }],
  }),
  row({
    id: "split-reciprocal",
    accountId: "savings",
    transferAccountId: "checking",
    transferTransactionId: "split-line",
    type: "transfer",
    amount: 250,
  }),
]);
assert.equal(imports.validate(valid.generationId).valid, true);
imports.commit(valid.generationId);
assert.equal(
  engine.listAccounts("valid-relations").accounts
    .find((account) => account.id === "savings").closedAt,
  "2025-01-01T00:00:00.000Z",
);
const page = engine.queryTransactions({
  budgetId: "valid-relations",
  accountId: "checking",
  limit: 10,
});
assert.equal(page.rows.find((candidate) => candidate.id === "split-parent").splitLines.length, 1);

const invalid = begin("invalid-relations");
imports.persistTransactions(invalid.generationId, [
  row({
    id: "orphan",
    transferAccountId: "savings",
    transferTransactionId: "missing",
    type: "transfer",
    amount: -100,
  }),
]);
assert.throws(
  () => imports.validate(invalid.generationId),
  (error) => error.code === "IMPORT_TRANSFER_INTEGRITY_FAILED",
);

console.log("Milestone 3 SQLite relational integrity passed.");
database.close();
