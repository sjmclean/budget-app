import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createBudgetEngineStore } from "../apps/server/src/budgetEngineStore.mjs";
import { createBudgetImportStore } from "../apps/server/src/budgetImportStore.mjs";

const database = new Database(":memory:");
const engine = createBudgetEngineStore(database);
const imports = createBudgetImportStore(database, engine);
const session = imports.begin({
  budgetId: "budget",
  budgetName: "Large budget",
  currency: "AUD",
});

imports.persistReferenceData(session.generationId, {
  accounts: [{
    id: "account",
    name: "Everyday",
    type: "checking",
    participation: "on-budget",
    openingBalance: 0,
    closedAt: null,
  }],
  payees: [],
  categories: [{
    id: "groceries",
    name: "Groceries",
    groupId: "living",
    groupName: "Living",
    sortOrder: 0,
  }],
});
imports.persistTransactions(session.generationId, [{
  id: "transaction",
  accountId: "account",
  payeeId: null,
  categoryId: "groceries",
  transferAccountId: null,
  transferTransactionId: null,
  splitLines: [],
  type: "standard",
  date: "2026-07-12",
  memo: null,
  checkNumber: null,
  amount: -2_500,
  clearedStatus: "cleared",
  createdAt: 1,
  updatedAt: 1,
}]);
imports.persistBudgetMonths(session.generationId, [{
  month: "2026-07",
  view: {
    budgetId: "budget",
    budgetName: "Large budget",
    monthLabel: "July 2026",
    currencyCode: "AUD",
    readyToAssign: 100,
    totalAssigned: 50,
    totalActivity: -25,
    totalAvailable: 25,
    categoryGroups: [{
      id: "living",
      name: "Living",
      previousAvailable: 0,
      assigned: 50,
      activity: -25,
      available: 25,
      note: "",
      categories: [{
        id: "groceries",
        name: "Groceries",
        previousAvailable: 0,
        assigned: 50,
        activity: -25,
        available: 25,
        isOverspent: false,
        isArchived: false,
        note: "",
      }],
    }],
  },
}]);
imports.validate(session.generationId);
imports.commit(session.generationId);
assert.deepEqual(engine.getBudgetStatus("budget").capabilities, {
  accountRegisters: true,
  budgetMonths: true,
  analytics: true,
  scheduledTransactions: true,
});

const initial = engine.getBudgetMonthView("budget", "2026-07");
assert.equal(initial.categoryGroups[0].categories[0].activity, -25);
assert.equal(initial.categoryGroups[0].categories[0].available, 25);

const edited = engine.setBudgetAssignments({
  budgetId: "budget",
  month: "2026-07",
  assignments: [{ categoryId: "groceries", assigned: 60 }],
});
assert.equal(edited.readyToAssign, 90);
assert.equal(edited.totalAssigned, 60);
assert.equal(edited.categoryGroups[0].categories[0].available, 35);

engine.updateTransaction({
  budgetId: "budget",
  accountId: "account",
  transactionId: "transaction",
  transaction: {
    date: "2026-07-12",
    amount: -3_000,
    categoryId: "groceries",
  },
});
const afterTransactionEdit = engine.getBudgetMonthView("budget", "2026-07");
assert.equal(afterTransactionEdit.totalActivity, -30);
assert.equal(afterTransactionEdit.totalAvailable, 30);

const overview = engine.getFinancialOverview("budget", "2026-07");
assert.equal(overview.netWorth, -30);
assert.equal(overview.monthlySnapshot.income, 0);
assert.equal(overview.monthlySnapshot.expenses, 30);
assert.equal(overview.monthlySnapshot.savings, -30);
assert.equal(overview.monthlySnapshot.readyToAssign, 90);
assert.equal(overview.netWorthTrend.length, 12);

const spending = engine.getMonthlySpending("budget", "2026-07");
assert.equal(spending.length, 1);
assert.equal(spending[0].categoryId, "groceries");
assert.equal(spending[0].total, 30);
assert.equal(spending[0].transactionCount, 1);
assert.deepEqual(spending[0].transactions, []);

const detail = engine.getMonthlyCategoryTransactions(
  "budget",
  "2026-07",
  "groceries",
);
assert.equal(detail.length, 1);
assert.equal(detail[0].outflow, 30);

database.close();
console.log("Milestone 3 SQLite dashboard/reports passed: bounded aggregates and drill-down.");
