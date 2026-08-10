import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import Database from "better-sqlite3";
import { createBudgetEngineStore } from "../apps/server/src/budgetEngineStore.mjs";
import { createBudgetImportStore } from "../apps/server/src/budgetImportStore.mjs";
import {
  createBudgetScheduledTransactionStore,
} from "../apps/server/src/budgetScheduledTransactionStore.mjs";

const database = new Database(":memory:");
database.pragma("foreign_keys = ON");
const engine = createBudgetEngineStore(database);
const schedules = createBudgetScheduledTransactionStore(database);
const imports = createBudgetImportStore(database, engine, schedules);

const session = imports.begin({
  budgetId: "large-import",
  budgetName: "Large import",
  currency: "AUD",
});
imports.persistReferenceData(session.generationId, {
  accounts: [
    {
      id: "checking",
      name: "Checking",
      type: "on-budget",
      participation: "on-budget",
      openingBalance: 10_000,
    },
    {
      id: "tracking",
      name: "Tracking",
      type: "tracking",
      participation: "off-budget",
      openingBalance: 0,
    },
  ],
  payees: [{ id: "shop", name: "Shop" }],
  categories: [{
    id: "food",
    name: "Food",
    groupId: "living",
    groupName: "Living",
    sortOrder: 0,
  }],
});
imports.persistScheduledTransactions(session.generationId, [{
  id: "scheduled-rent",
  accountId: "checking",
  tagIds: [],
  nextDueDate: "2025-02-01",
  frequency: "monthly",
  recurrenceInterval: 1,
  recurrenceUnit: "month",
  recurrenceAnchorDate: "2025-02-01",
  endCondition: "never",
  occurrencesCompleted: 0,
  weekendPolicy: "same-day",
  payee: "Landlord",
  payeeId: null,
  category: "Food",
  categoryId: "food",
  memo: "Imported schedule",
  outflow: 1250,
  inflow: 0,
  splitLines: [],
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
}]);

const insertCount = 100_000;
for (let offset = 0; offset < insertCount; offset += 2_000) {
  const rows = Array.from(
    { length: Math.min(2_000, insertCount - offset) },
    (_, batchIndex) => {
      const index = offset + batchIndex;
      return {
        id: `transaction-${String(index).padStart(7, "0")}`,
        accountId: "checking",
        payeeId: "shop",
        categoryId: "food",
        transferAccountId: null,
        type: "standard",
        date: `2025-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
        memo: null,
        checkNumber: null,
        amount: index % 2 === 0 ? 100 : -50,
        clearedStatus: "cleared",
        createdAt: 1,
        updatedAt: 1,
      };
    },
  );
  imports.persistTransactions(session.generationId, rows);
}

assert.equal(engine.getBudgetStatus("large-import").state, "legacy");
assert.throws(
  () => engine.queryTransactions({
    budgetId: "large-import",
    accountId: "checking",
    limit: 150,
  }),
  (error) => error.code === "SQLITE_BUDGET_NOT_ACTIVE",
);

const validationStartedAt = performance.now();
const validation = imports.validate(session.generationId);
const validationMs = performance.now() - validationStartedAt;
assert.equal(validation.valid, true);
assert.equal(validation.counts.transactions, insertCount);
assert.equal(validation.counts.scheduledTransactions, 1);
assert.ok(
  validationMs < 50,
  `Constant-time validation took ${validationMs.toFixed(1)} ms; expected under 50 ms.`,
);
const activationStartedAt = performance.now();
const activated = imports.commit(session.generationId);
const activationMs = performance.now() - activationStartedAt;
assert.equal(activated.state, "active");
assert.deepEqual(activated.capabilities, {
  accountRegisters: true,
  budgetMonths: false,
  analytics: false,
  scheduledTransactions: true,
});
assert.equal(schedules.listByAccount("large-import", "checking").length, 1);
assert.equal(
  schedules.listByAccount("large-import", "checking")[0].memo,
  "Imported schedule",
);
assert.ok(
  activationMs < 250,
  `Pointer activation took ${activationMs.toFixed(1)} ms; expected under 250 ms.`,
);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM transactions WHERE budget_id = ?")
    .get("large-import").count,
  0,
  "Activation must not copy generation rows into the legacy transaction table.",
);
assert.equal(
  database.prepare(
    "SELECT COUNT(*) AS count FROM budget_import_transactions WHERE generation_id = ?",
  ).get(session.generationId).count,
  insertCount,
  "The activated generation must remain queryable without a second ledger copy.",
);

const summary = engine.getAccountSummary("large-import", "checking");
assert.equal(summary.transactionCount, insertCount);
const page = engine.queryTransactions({
  budgetId: "large-import",
  accountId: "checking",
  limit: 150,
});
assert.equal(page.rows.length, 150);
assert.equal(page.hasMore, true);
const navigationStartedAt = performance.now();
const navigation = engine.listAccounts("large-import");
const navigationMs = performance.now() - navigationStartedAt;
assert.equal(navigation.accounts[0].transactionCount, insertCount);
assert.equal(navigation.accounts[0].workingBalance, 2_510_000);
assert.equal(navigation.accounts[0].hasUncategorizedTransactions, false);
assert.ok(
  navigationMs < 50,
  `Materialized account navigation took ${navigationMs.toFixed(1)} ms; expected under 50 ms.`,
);
engine.addTransaction({
  budgetId: "large-import",
  accountId: "tracking",
  transaction: {
    id: "tracking-without-category",
    date: "2025-12-31",
    amount: 500,
    payeeName: "Tracking adjustment",
  },
});
assert.equal(
  engine.listAccounts("large-import").accounts
    .find((account) => account.id === "tracking").hasUncategorizedTransactions,
  false,
  "Tracking accounts must never raise budget-category warnings.",
);
database.prepare(
  "DELETE FROM budget_import_account_aggregates WHERE generation_id = ?",
).run(session.generationId);
const rebuiltNavigation = engine.listAccounts("large-import");
assert.equal(rebuiltNavigation.accounts[0].workingBalance, 2_510_000);
assert.equal(
  database.prepare(
    "SELECT COUNT(*) AS count FROM budget_import_account_aggregates WHERE generation_id = ?",
  ).get(session.generationId).count,
  2,
  "An existing generation without materialized aggregates should be rebuilt once.",
);

const invalid = imports.begin({
  budgetId: "invalid-import",
  budgetName: "Invalid",
  currency: "AUD",
});
imports.persistReferenceData(invalid.generationId, {
  accounts: [{
    id: "valid",
    name: "Valid",
    type: "on-budget",
    participation: "on-budget",
    openingBalance: 0,
  }],
  payees: [],
  categories: [],
});
assert.throws(
  () => imports.persistTransactions(invalid.generationId, [{
    id: "bad",
    accountId: "missing",
    payeeId: null,
    categoryId: null,
    transferAccountId: null,
    type: "standard",
    date: "2025-01-01",
    memo: null,
    checkNumber: null,
    amount: 1,
    clearedStatus: "uncleared",
    createdAt: 1,
    updatedAt: 1,
  }]),
  (error) => error.code === "IMPORT_VALIDATION_FAILED" && error.statusCode === 422,
);
imports.cancel(invalid.generationId);
assert.equal(engine.getBudgetStatus("invalid-import").state, "legacy");

console.log(
  `Milestone 3 staged SQLite import passed: 100,000 rows, validation ${validationMs.toFixed(1)} ms, pointer activation ${activationMs.toFixed(1)} ms, sidebar aggregates ${navigationMs.toFixed(1)} ms.`,
);
database.close();
