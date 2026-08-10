import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createBudgetEngineStore } from "../apps/server/src/budgetEngineStore.mjs";
import { createBudgetImportStore } from "../apps/server/src/budgetImportStore.mjs";

const database = new Database(":memory:");
const engine = createBudgetEngineStore(database);
const imports = createBudgetImportStore(database, engine);
const session = imports.begin({
  budgetId: "transaction-workflows",
  budgetName: "Transaction workflows",
  currency: "AUD",
});
imports.persistReferenceData(session.generationId, {
  accounts: [
    {
      id: "source", name: "Source", type: "checking",
      participation: "on-budget", openingBalance: 0, closedAt: null,
    },
    {
      id: "target", name: "Target", type: "savings",
      participation: "on-budget", openingBalance: 0, closedAt: null,
    },
  ],
  payees: [],
  categories: [],
});
imports.persistTransactions(session.generationId, []);
imports.validate(session.generationId);
imports.commit(session.generationId);

const tag = {
  id: "review",
  name: "Review",
  description: "Needs review",
  colour: "blue",
  autoTagImportedTransactions: false,
  archived: false,
  createdAt: "2026-07-29T00:00:00.000Z",
  updatedAt: "2026-07-29T00:00:00.000Z",
};
assert.deepEqual(engine.replaceTransactionTags("transaction-workflows", [tag]).tags, [tag]);

function write(id, amount, memo = id, tagIds = []) {
  return {
    id,
    date: "2026-07-29",
    amount,
    memo,
    tagIds,
    splitLines: [],
  };
}

engine.commitTransactionBatch({
  budgetId: "transaction-workflows",
  accountId: "source",
  additions: [write("first", -1250, "first", ["review"]), write("second", 5000)],
  updates: [],
});
assert.equal(engine.getAccountSummary("transaction-workflows", "source").transactionCount, 2);
assert.deepEqual(
  engine.queryTransactions({
    budgetId: "transaction-workflows", accountId: "source", limit: 10,
  }).rows.find(({ id }) => id === "first").tagIds,
  ["review"],
);

assert.throws(
  () => engine.commitTransactionBatch({
    budgetId: "transaction-workflows",
    accountId: "source",
    additions: [write("rolled-back", 100)],
    updates: [{ ...write("missing", 200), id: "missing" }],
  }),
  (error) => error.code === "TRANSACTION_NOT_FOUND",
);
assert.equal(
  engine.queryTransactions({
    budgetId: "transaction-workflows",
    accountId: "source",
    limit: 10,
  }).rows.some(({ id }) => id === "rolled-back"),
  false,
  "a failed batch must roll back earlier additions",
);

const searched = engine.queryTransactions({
  budgetId: "transaction-workflows",
  accountId: "source",
  limit: 1,
  offset: 0,
  search: { query: "second", scope: "memo" },
  categoryFilter: "all",
  sort: { column: "inflow", direction: "descending" },
});
assert.equal(searched.totalCount, 1);
assert.deepEqual(searched.rows.map(({ id }) => id), ["second"]);
assert.equal(searched.hasMore, false);

const uncategorisedFirst = engine.queryTransactions({
  budgetId: "transaction-workflows",
  accountId: "source",
  limit: 1,
  offset: 0,
  categoryFilter: "uncategorised",
  sort: { column: "inflow", direction: "descending" },
});
assert.equal(uncategorisedFirst.totalCount, 2);
assert.deepEqual(uncategorisedFirst.rows.map(({ id }) => id), ["second"]);
assert.equal(uncategorisedFirst.hasMore, true);
const uncategorisedSecond = engine.queryTransactions({
  budgetId: "transaction-workflows",
  accountId: "source",
  limit: 1,
  offset: 1,
  categoryFilter: "uncategorised",
  sort: { column: "inflow", direction: "descending" },
});
assert.deepEqual(uncategorisedSecond.rows.map(({ id }) => id), ["first"]);

engine.commitTransactionBatch({
  budgetId: "transaction-workflows",
  accountId: "source",
  additions: [],
  updates: [{ ...write("first", -1500, "updated", []), id: "first" }],
});
assert.equal(
  engine.queryTransactions({
    budgetId: "transaction-workflows",
    accountId: "source",
    limit: 10,
  }).rows.find(({ id }) => id === "first").memo,
  "updated",
);
assert.deepEqual(
  engine.queryTransactions({
    budgetId: "transaction-workflows", accountId: "source", limit: 10,
  }).rows.find(({ id }) => id === "first").tagIds,
  [],
);

engine.moveTransactions({
  budgetId: "transaction-workflows",
  sourceAccountId: "source",
  targetAccountId: "target",
  transactionIds: ["first", "second"],
});
assert.equal(engine.getAccountSummary("transaction-workflows", "source").transactionCount, 0);
assert.equal(engine.getAccountSummary("transaction-workflows", "target").transactionCount, 2);
assert.equal(
  engine.listAccounts("transaction-workflows").accounts
    .find(({ id }) => id === "source").transactionCount,
  0,
);
assert.equal(
  engine.listAccounts("transaction-workflows").accounts
    .find(({ id }) => id === "target").transactionCount,
  2,
);

console.log("Milestone 3 SQLite transaction workflows passed.");
database.close();
