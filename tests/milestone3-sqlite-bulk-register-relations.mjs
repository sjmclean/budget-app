import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createBudgetEngineStore } from "../apps/server/src/budgetEngineStore.mjs";
import { createBudgetImportStore } from "../apps/server/src/budgetImportStore.mjs";

const rawDatabase = new Database(":memory:");
let prepareCount = 0;
const database = new Proxy(rawDatabase, {
  get(target, property) {
    if (property === "prepare") {
      return (...args) => {
        prepareCount += 1;
        return target.prepare(...args);
      };
    }
    const value = target[property];
    return typeof value === "function" ? value.bind(target) : value;
  },
});

const engine = createBudgetEngineStore(database);
const importer = createBudgetImportStore(database, engine);
const session = importer.begin({
  budgetId: "bulk-relations",
  budgetName: "Bulk relations",
  currency: "AUD",
});
importer.persistReferenceData(session.generationId, {
  accounts: [{
    id: "everyday", name: "Everyday", type: "checking",
    participation: "on-budget", openingBalance: 0, closedAt: null,
  }],
  payees: [],
  categories: [{
    id: "groceries", name: "Groceries", groupId: "living",
    groupName: "Living", sortOrder: 0,
  }],
});
importer.persistTransactions(
  session.generationId,
  Array.from({ length: 250 }, (_, index) => ({
    id: `transaction-${String(index).padStart(3, "0")}`,
    accountId: "everyday",
    payeeId: null,
    categoryId: null,
    transferAccountId: null,
    transferTransactionId: null,
    type: "split",
    date: "2026-07-29",
    memo: `bulk row ${index}`,
    checkNumber: null,
    amount: -100,
    clearedStatus: "uncleared",
    createdAt: index,
    updatedAt: index,
    splitLines: [{
      id: `split-${index}`,
      categoryId: "groceries",
      transferAccountId: null,
      transferTransactionId: null,
      memo: `split ${index}`,
      amount: -100,
    }],
  })),
);
importer.validate(session.generationId);
importer.commit(session.generationId);

rawDatabase.prepare(`
  INSERT INTO budget_import_transaction_tags (
    generation_id, id, name, colour, auto_tag_imported, archived,
    sort_order, created_at, updated_at
  ) VALUES (?, 'review', 'Review', 'blue', 0, 0, 0, ?, ?)
`).run(
  session.generationId,
  "2026-07-29T00:00:00.000Z",
  "2026-07-29T00:00:00.000Z",
);
const insertAssignment = rawDatabase.prepare(`
  INSERT INTO budget_import_transaction_tag_assignments (
    generation_id, transaction_id, tag_id
  ) VALUES (?, ?, 'review')
`);
rawDatabase.transaction(() => {
  for (let index = 0; index < 250; index += 1) {
    insertAssignment.run(
      session.generationId,
      `transaction-${String(index).padStart(3, "0")}`,
    );
  }
})();

const beforeFirstPage = prepareCount;
const firstPage = engine.queryTransactions({
  budgetId: "bulk-relations",
  accountId: "everyday",
  limit: 250,
});
assert.equal(firstPage.rows.length, 250);
assert.deepEqual(firstPage.rows[0].tagIds, ["review"]);
assert.equal(firstPage.rows[0].splitLines.length, 1);
assert.equal(firstPage.rows[0].splitLines[0].categoryName, "Groceries");
assert.equal(
  prepareCount - beforeFirstPage,
  2,
  "a full register page should prepare one bulk split and one bulk tag query",
);

const beforeRepeatedPage = prepareCount;
engine.queryTransactions({
  budgetId: "bulk-relations",
  accountId: "everyday",
  limit: 250,
});
assert.equal(
  prepareCount - beforeRepeatedPage,
  0,
  "relation query plans should be reused for equal-sized pages",
);

const beforeAdvanced = prepareCount;
const searched = engine.queryTransactions({
  budgetId: "bulk-relations",
  accountId: "everyday",
  limit: 250,
  offset: 0,
  search: { query: "bulk", scope: "memo" },
  categoryFilter: "all",
  sort: { column: "date", direction: "descending" },
});
assert.equal(searched.rows.length, 250);
assert.equal(prepareCount - beforeAdvanced, 2);

const beforeRepeatedAdvanced = prepareCount;
engine.queryTransactions({
  budgetId: "bulk-relations",
  accountId: "everyday",
  limit: 250,
  offset: 0,
  search: { query: "bulk", scope: "memo" },
  categoryFilter: "all",
  sort: { column: "date", direction: "descending" },
});
assert.equal(
  prepareCount - beforeRepeatedAdvanced,
  0,
  "advanced row/count query plans should be cached",
);

rawDatabase.close();
console.log(
  "Milestone 3 bulk register relations passed: 250 rows with bounded relation queries and cached advanced plans.",
);
