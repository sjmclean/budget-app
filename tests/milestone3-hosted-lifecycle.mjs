import assert from "node:assert/strict";
import { Readable } from "node:stream";
import Database from "better-sqlite3";
import { createBudgetEngineStore } from "../apps/server/src/budgetEngineStore.mjs";
import { createBudgetImportStore } from "../apps/server/src/budgetImportStore.mjs";
import { createBudgetReferenceDataStore } from "../apps/server/src/budgetReferenceDataStore.mjs";
import { createBudgetScheduledTransactionStore } from
  "../apps/server/src/budgetScheduledTransactionStore.mjs";
import {
  createBudgetLifecycleStore,
  HOSTED_BUDGET_BACKUP_SCHEMA,
} from "../apps/server/src/budgetLifecycleStore.mjs";

const database = new Database(":memory:");
const engine = createBudgetEngineStore(database);
const importer = createBudgetImportStore(database, engine);
const referenceData = createBudgetReferenceDataStore(database, engine);
const schedules = createBudgetScheduledTransactionStore(database);
const lifecycle = createBudgetLifecycleStore(database, engine, importer, schedules);

const initial = importer.begin({
  budgetId: "budget-1",
  budgetName: "Lifecycle Test",
  currency: "AUD",
});
importer.persistReferenceData(initial.generationId, {
  accounts: [{
    id: "account-1",
    name: "Everyday",
    type: "on-budget",
    participation: "budget",
    openingBalance: 0,
    closedAt: null,
  }],
  payees: [{ id: "payee-1", name: "Grocer" }],
  categories: [{
    id: "category-1",
    name: "Groceries",
    groupId: "group-1",
    groupName: "Living",
    sortOrder: 0,
  }],
});
importer.persistBudgetMonths(initial.generationId, [{
  month: "2026-07",
  view: {
    budgetId: "budget-1",
    budgetName: "Lifecycle Test",
    monthLabel: "July 2026",
    currencyCode: "AUD",
    readyToAssign: 500,
    totalAssigned: 500,
    totalActivity: -25,
    totalAvailable: 475,
    categoryGroups: [],
  },
}]);
importer.persistTransactions(initial.generationId, [{
  id: "transaction-1",
  accountId: "account-1",
  payeeId: "payee-1",
  categoryId: "category-1",
  transferAccountId: null,
  transferTransactionId: null,
  type: "standard",
  date: "2026-07-10",
  memo: "Weekly shop",
  checkNumber: null,
  amount: -2500,
  clearedStatus: "cleared",
  createdAt: 1,
  updatedAt: 1,
  splitLines: [],
}]);
importer.validate(initial.generationId);
importer.commit(initial.generationId);
referenceData.updatePayee("budget-1", "payee-1", {
  name: "Grocer",
  note: "Lifecycle metadata",
  defaultCategoryId: "category-1",
  defaultCategoryName: "Living: Groceries",
  importRules: [{ id: "rule-1", matchType: "contains", text: "grocer" }],
});
engine.replaceTransactionTags("budget-1", [{
  id: "review",
  name: "Review",
  description: "Needs review",
  colour: "blue",
  autoTagImportedTransactions: false,
  archived: false,
  createdAt: "2026-07-29T00:00:00.000Z",
  updatedAt: "2026-07-29T00:00:00.000Z",
}]);
engine.updateTransaction({
  budgetId: "budget-1",
  accountId: "account-1",
  transactionId: "transaction-1",
  transaction: {
    date: "2026-07-10",
    amount: -2500,
    payeeId: "payee-1",
    categoryId: "category-1",
    memo: "Weekly shop",
    tagIds: ["review"],
    splitLines: [],
  },
});
schedules.create("budget-1", {
  id: "schedule-1",
  accountId: "account-1",
  tagIds: ["review"],
  nextDueDate: "2026-08-01",
  frequency: "monthly",
  payee: "Grocer",
  payeeId: "payee-1",
  category: "Groceries",
  categoryId: "category-1",
  memo: "Scheduled shop",
  outflow: 25,
  inflow: 0,
  splitLines: [],
});

const exported = [...lifecycle.exportLines("budget-1", "backup")].join("");
const records = exported.trimEnd().split("\n").map(JSON.parse);
assert.equal(records[0].schema, HOSTED_BUDGET_BACKUP_SCHEMA);
assert.equal(records[0].counts.transactions, 1);
assert.equal(records[0].counts.transactionTags, 1);
assert.equal(records[0].counts.transactionTagAssignments, 1);
assert.equal(records[0].counts.scheduledTransactions, 1);
assert.equal(records.at(-1).algorithm, "sha256");

database.prepare(`
  UPDATE budget_import_transactions SET amount = -9999
  WHERE generation_id = ? AND id = 'transaction-1'
`).run(initial.generationId);

const restored = await lifecycle.restore("budget-1", Readable.from([
  Buffer.from(exported.slice(0, 53)),
  Buffer.from(exported.slice(53)),
]));
assert.equal(restored.restored, true);
assert.equal(restored.counts.transactions, 1);
assert.equal(restored.counts.transactionTags, 1);
assert.equal(restored.counts.scheduledTransactions, 1);
const restoredStatus = engine.getBudgetStatus("budget-1");
assert.notEqual(restoredStatus.generationId, initial.generationId);
assert.equal(
  database.prepare(`
    SELECT amount FROM budget_import_transactions
    WHERE generation_id = ? AND id = 'transaction-1'
  `).get(restoredStatus.generationId).amount,
  -2500,
);
assert.equal(
  referenceData.listPayees("budget-1", false)[0].note,
  "Lifecycle metadata",
  "hosted backup must preserve payee administration metadata",
);
assert.deepEqual(engine.listTransactionTags("budget-1").tags.map(({ id }) => id), ["review"]);
assert.deepEqual(
  engine.queryTransactions({
    budgetId: "budget-1", accountId: "account-1", limit: 10,
  }).rows[0].tagIds,
  ["review"],
);
assert.deepEqual(
  schedules.listByAccount("budget-1", "account-1").map(({ id }) => id),
  ["schedule-1"],
);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM budget_import_sessions WHERE generation_id = ?")
    .get(initial.generationId).count,
  0,
  "successful restore must remove the replaced generation",
);

const activeBeforeCorruptRestore = restoredStatus.generationId;
const corrupt = exported.replace('"amount":-2500', '"amount":-2501');
await assert.rejects(
  lifecycle.restore("budget-1", Readable.from([Buffer.from(corrupt)])),
  (error) => error.code === "HOSTED_BACKUP_INTEGRITY_FAILED",
);
assert.equal(
  engine.getBudgetStatus("budget-1").generationId,
  activeBeforeCorruptRestore,
  "failed restore must preserve the active generation",
);

const reset = lifecycle.reset("budget-1", "2026-07");
assert.equal(reset.reset, true);
const resetStatus = engine.getBudgetStatus("budget-1");
assert.equal(resetStatus.capabilities.accountRegisters, true);
assert.equal(resetStatus.capabilities.budgetMonths, true);
assert.equal(engine.listAccounts("budget-1").accounts.length, 0);
assert.equal(engine.getBudgetMonthView("budget-1", "2026-07").categoryGroups.length, 0);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM budget_import_sessions WHERE generation_id = ?")
    .get(activeBeforeCorruptRestore).count,
  0,
);

const deletedGenerationId = resetStatus.generationId;
const deleted = lifecycle.deleteBudget("budget-1");
assert.equal(deleted.deleted, true);
assert.equal(engine.getBudgetStatus("budget-1").state, "legacy");
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM budget_import_sessions WHERE generation_id = ?")
    .get(deletedGenerationId).count,
  0,
);

const disasterRecovery = await lifecycle.restore(
  "budget-1",
  Readable.from([Buffer.from(exported)]),
);
assert.equal(disasterRecovery.restored, true);
assert.equal(engine.getBudgetStatus("budget-1").state, "active");
assert.equal(engine.getAccountSummary("budget-1", "account-1").transactionCount, 1);
lifecycle.deleteBudget("budget-1");

database.close();
console.log("Milestone 3 hosted lifecycle passed: streamed round-trip, rollback, reset, deletion, and disaster recovery.");
