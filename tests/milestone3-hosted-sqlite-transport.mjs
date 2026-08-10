import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createBudgetEngineStore } from "../apps/server/src/budgetEngineStore.mjs";

const database = new Database(":memory:");
const store = createBudgetEngineStore(database);
assert.ok(
  database.pragma("index_list('budget_import_transactions')")
    .some(({ name }) => name === "idx_budget_import_transactions_month"),
  "Monthly budget reads require a non-partial generation/month transaction index.",
);
const now = Date.now();
const budgetId = "transport-budget";
const accountId = "transport-account";

database.prepare(
  "INSERT INTO budgets (id, name, currency, created_at) VALUES (?, ?, ?, ?)",
).run(budgetId, "Transport budget", "AUD", now);
database.prepare(`
  INSERT INTO accounts (
    id, budget_id, name, type, participation, opening_balance, current_balance
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(accountId, budgetId, "Everyday", "checking", "on-budget", 1_000, 1_000);

const insert = database.prepare(`
  INSERT INTO transactions (
    id, budget_id, account_id, type, date, amount, cleared_status,
    is_deleted, created_at, updated_at
  ) VALUES (?, ?, ?, 'standard', ?, ?, ?, 0, ?, ?)
`);
database.transaction(() => {
  for (let index = 0; index < 1_000; index++) {
    insert.run(
      `transaction-${String(index).padStart(5, "0")}`,
      budgetId,
      accountId,
      `2025-01-${String((index % 28) + 1).padStart(2, "0")}`,
      index % 2 === 0 ? 100 : -50,
      index % 4 === 0 ? "uncleared" : "cleared",
      now,
      now,
    );
  }
})();

assert.deepEqual(store.getBudgetStatus(budgetId), {
  budgetId,
  generationId: null,
  state: "legacy",
  activatedAt: null,
  capabilities: {
    accountRegisters: false,
    budgetMonths: false,
    analytics: false,
    scheduledTransactions: false,
  },
});
assert.throws(
  () => store.queryTransactions({ budgetId, accountId, limit: 150 }),
  (error) => error.code === "SQLITE_BUDGET_NOT_ACTIVE" && error.statusCode === 404,
);

store.activateBudget(budgetId, "generation-1", now);
const summary = store.getAccountSummary(budgetId, accountId);
assert.equal(summary.generationId, "generation-1");
assert.equal(summary.transactionCount, 1_000);
assert.equal(summary.currencyCode, "AUD");
const bootstrap = store.getAccountRegisterBootstrap({
  budgetId,
  accountId,
  limit: 150,
});
assert.equal(bootstrap.summary.transactionCount, 1_000);
assert.equal(bootstrap.page.rows.length, 150);

const first = store.queryTransactions({ budgetId, accountId, limit: 150 });
assert.equal(first.rows.length, 150);
assert.equal(first.hasMore, true);
assert.ok(first.nextCursor);
const second = store.queryTransactions({
  budgetId,
  accountId,
  limit: 150,
  before: first.nextCursor,
});
assert.equal(second.rows.length, 150);
assert.equal(
  first.rows.some((left) => second.rows.some((right) => right.id === left.id)),
  false,
);
assert.throws(
  () => store.queryTransactions({ budgetId, accountId, limit: 251 }),
  (error) => error.code === "INVALID_PAGE_SIZE" && error.statusCode === 400,
);

const importedBudgetId = "imported-write-budget";
const importedAccountId = "imported-account";
const importedGenerationId = "imported-generation";
database.prepare(`
  INSERT INTO budget_import_sessions (
    generation_id, budget_id, budget_name, currency, state, created_at, updated_at,
    account_count, transaction_count
  ) VALUES (?, ?, 'Imported', 'AUD', 'committed', ?, ?, 2, 1)
`).run(importedGenerationId, importedBudgetId, now, now);
database.prepare(`
  INSERT INTO budget_import_accounts (
    generation_id, id, name, type, participation, opening_balance
  ) VALUES (?, ?, 'Imported account', 'checking', 'on-budget', 500)
`).run(importedGenerationId, importedAccountId);
database.prepare(`
  INSERT INTO budget_import_accounts (
    generation_id, id, name, type, participation, opening_balance
  ) VALUES (?, 'savings-account', 'Savings', 'savings', 'on-budget', 0)
`).run(importedGenerationId);
database.prepare(`
  INSERT INTO budget_import_transactions (
    generation_id, id, account_id, type, date, amount, cleared_status, created_at, updated_at
  ) VALUES (?, 'existing', ?, 'standard', '2025-02-01', -100, 'uncleared', ?, ?)
`).run(importedGenerationId, importedAccountId, now, now);
store.activateBudget(importedBudgetId, importedGenerationId, now);
assert.deepEqual(
  store.listAccounts(importedBudgetId).accounts.map((account) => account.id),
  [importedAccountId, "savings-account"],
  "The active SQLite account list must not depend on legacy browser account records.",
);
store.setAccountClosed({
  budgetId: importedBudgetId,
  accountId: "savings-account",
  closed: true,
});
assert.ok(store.listAccounts(importedBudgetId).accounts
  .find((account) => account.id === "savings-account").closedAt);
store.setAccountClosed({
  budgetId: importedBudgetId,
  accountId: "savings-account",
  closed: false,
});
assert.equal(store.listAccounts(importedBudgetId).accounts
  .find((account) => account.id === "savings-account").closedAt, null);

store.addTransaction({
  budgetId: importedBudgetId,
  accountId: importedAccountId,
  transaction: { id: "added", date: "2025-02-02", amount: 250, memo: "Added" },
});
assert.equal(store.getAccountSummary(importedBudgetId, importedAccountId).transactionCount, 2);
assert.equal(store.getAccountSummary(importedBudgetId, importedAccountId).workingBalance, 650);

store.updateTransaction({
  budgetId: importedBudgetId,
  accountId: importedAccountId,
  transactionId: "added",
  transaction: { date: "2025-02-03", amount: 300, memo: "Updated" },
});
assert.equal(store.getAccountSummary(importedBudgetId, importedAccountId).workingBalance, 700);

store.toggleTransactionCleared({
  budgetId: importedBudgetId,
  accountId: importedAccountId,
  transactionId: "added",
});
assert.equal(store.getAccountSummary(importedBudgetId, importedAccountId).clearedBalance, 800);

store.deleteTransaction({
  budgetId: importedBudgetId,
  accountId: importedAccountId,
  transactionId: "added",
});
assert.equal(store.getAccountSummary(importedBudgetId, importedAccountId).transactionCount, 1);
assert.equal(
  database.prepare("SELECT transaction_count FROM budget_import_sessions WHERE generation_id = ?")
    .get(importedGenerationId).transaction_count,
  1,
);

store.addTransaction({
  budgetId: importedBudgetId,
  accountId: importedAccountId,
  transaction: {
    id: "transfer-source",
    date: "2025-03-01",
    amount: -400,
    payeeName: "Transfer: Savings",
  },
});
const transferRows = database.prepare(`
  SELECT * FROM budget_import_transactions
  WHERE generation_id = ? AND (id = 'transfer-source' OR transfer_transaction_id = 'transfer-source')
  ORDER BY amount
`).all(importedGenerationId);
assert.equal(transferRows.length, 2);
assert.deepEqual(transferRows.map((row) => row.amount), [-400, 400]);
assert.equal(transferRows[0].transfer_transaction_id, transferRows[1].id);
assert.equal(transferRows[1].transfer_transaction_id, transferRows[0].id);

store.toggleTransactionCleared({
  budgetId: importedBudgetId,
  accountId: importedAccountId,
  transactionId: "transfer-source",
});
assert.deepEqual(
  database.prepare(`
    SELECT DISTINCT cleared_status FROM budget_import_transactions
    WHERE generation_id = ? AND (id = 'transfer-source' OR transfer_transaction_id = 'transfer-source')
  `).all(importedGenerationId).map((row) => row.cleared_status),
  ["cleared"],
);

store.updateTransaction({
  budgetId: importedBudgetId,
  accountId: importedAccountId,
  transactionId: "transfer-source",
  transaction: { date: "2025-03-02", amount: -450, payeeName: "Transfer: Savings" },
});
assert.deepEqual(
  database.prepare(`
    SELECT amount FROM budget_import_transactions
    WHERE generation_id = ? AND (id = 'transfer-source' OR transfer_transaction_id = 'transfer-source')
    ORDER BY amount
  `).all(importedGenerationId).map((row) => row.amount),
  [-450, 450],
);

store.deleteTransaction({
  budgetId: importedBudgetId,
  accountId: importedAccountId,
  transactionId: "transfer-source",
});
assert.equal(
  database.prepare(`
    SELECT COUNT(*) AS count FROM budget_import_transactions
    WHERE generation_id = ? AND (id = 'transfer-source' OR transfer_transaction_id = 'transfer-source')
  `).get(importedGenerationId).count,
  0,
);

store.addTransaction({
  budgetId: importedBudgetId,
  accountId: importedAccountId,
  transaction: {
    id: "split-parent",
    date: "2025-04-01",
    amount: -1_000,
    payeeName: "Split purchase",
    splitLines: [
      { id: "split-category", categoryId: null, amount: -600 },
      { id: "split-transfer", transferAccountId: "savings-account", amount: -400 },
    ],
  },
});
const splitPage = store.queryTransactions({
  budgetId: importedBudgetId,
  accountId: importedAccountId,
  limit: 10,
});
const splitParent = splitPage.rows.find((row) => row.id === "split-parent");
assert.equal(splitParent.splitLines.length, 2);
assert.ok(splitParent.splitLines.find((line) => line.id === "split-transfer")?.transferTransactionId);
const splitReciprocalId = splitParent.splitLines
  .find((line) => line.id === "split-transfer").transferTransactionId;
assert.equal(
  database.prepare(`
    SELECT amount FROM budget_import_transactions WHERE generation_id = ? AND id = ?
  `).get(importedGenerationId, splitReciprocalId).amount,
  400,
);

store.deleteTransaction({
  budgetId: importedBudgetId,
  accountId: importedAccountId,
  transactionId: "split-parent",
});
assert.equal(
  database.prepare(`
    SELECT COUNT(*) AS count FROM budget_import_transactions
    WHERE generation_id = ? AND id IN ('split-parent', ?)
  `).get(importedGenerationId, splitReciprocalId).count,
  0,
);

console.log("Milestone 3 hosted SQLite transport passed.");
database.close();
