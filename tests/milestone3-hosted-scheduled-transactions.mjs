import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createBudgetEngineStore } from "../apps/server/src/budgetEngineStore.mjs";
import { createBudgetImportStore } from "../apps/server/src/budgetImportStore.mjs";
import { createBudgetScheduledTransactionStore } from
  "../apps/server/src/budgetScheduledTransactionStore.mjs";

const database = new Database(":memory:");
const engine = createBudgetEngineStore(database);
const importer = createBudgetImportStore(database, engine);
const schedules = createBudgetScheduledTransactionStore(database);
const session = importer.begin({
  budgetId: "scheduled-budget",
  budgetName: "Schedules",
  currency: "AUD",
});
importer.persistReferenceData(session.generationId, {
  accounts: [{
    id: "everyday", name: "Everyday", type: "checking",
    participation: "on-budget", openingBalance: 0, closedAt: null,
  }],
  payees: [{ id: "rent", name: "Landlord" }],
  categories: [{
    id: "housing", name: "Housing", groupId: "living",
    groupName: "Living", sortOrder: 0,
  }],
});
importer.persistTransactions(session.generationId, []);
importer.validate(session.generationId);
importer.commit(session.generationId);

const created = schedules.create("scheduled-budget", {
  id: "rent-schedule",
  accountId: "everyday",
  tagIds: ["review"],
  nextDueDate: "2026-08-01",
  frequency: "monthly",
  recurrenceInterval: 1,
  recurrenceUnit: "month",
  endCondition: "after-occurrences",
  occurrenceCount: 2,
  weekendPolicy: "next-business-day",
  payee: "Landlord",
  payeeId: "rent",
  category: "Housing",
  categoryId: "housing",
  memo: "Rent",
  outflow: 1500,
  inflow: 0,
  splitLines: [{
    id: "rent-split", category: "Housing", categoryId: "housing",
    memo: "Base rent", outflow: 1500, inflow: 0,
  }],
});
assert.equal(created.length, 1);
assert.equal(created[0].nextDueDate, "2026-08-03");
assert.deepEqual(created[0].tagIds, ["review"]);
assert.equal(created[0].splitLines[0].outflow, 1500);

const advanced = schedules.advance(
  "scheduled-budget", "everyday", "rent-schedule",
);
assert.equal(advanced[0].nextDueDate, "2026-09-01");
assert.equal(advanced[0].occurrencesCompleted, 1);
assert.deepEqual(
  schedules.advance("scheduled-budget", "everyday", "rent-schedule"),
  [],
  "the occurrence limit should remove the completed schedule",
);

assert.equal(
  database.prepare(`
    SELECT COUNT(*) AS count FROM budget_import_scheduled_transaction_splits
  `).get().count,
  0,
  "deleting a schedule must clean up split lines",
);
assert.equal(
  database.prepare(`
    SELECT COUNT(*) AS count FROM budget_import_scheduled_transaction_tags
  `).get().count,
  0,
  "deleting a schedule must clean up tag assignments",
);

database.close();
console.log("Milestone 3 hosted scheduled transactions passed.");
