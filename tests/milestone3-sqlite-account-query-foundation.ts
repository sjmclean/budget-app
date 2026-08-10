import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import Database from "better-sqlite3";
import { initDatabase } from "../packages/database/src/initDatabase.js";
import { SqliteAccountRegisterQueryService } from "../packages/database/src/SqliteAccountRegisterQueryService.js";

const sqlite = new Database(":memory:");
initDatabase(sqlite);

const budgetId = "large-budget";
const accountId = "large-account";
const now = Date.now();
sqlite.prepare(
  "INSERT INTO budgets (id, name, currency, created_at) VALUES (?, ?, ?, ?)",
).run(budgetId, "Large budget", "AUD", now);
sqlite.prepare(`
  INSERT INTO accounts (
    id, budget_id, name, type, participation, opening_balance, current_balance
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(accountId, budgetId, "Everyday", "checking", "on-budget", 10_000, 10_000);

const insert = sqlite.prepare(`
  INSERT INTO transactions (
    id, budget_id, account_id, payee_id, category_id, transfer_account_id,
    type, date, memo, check_number, amount, cleared_status, is_deleted,
    created_at, updated_at
  ) VALUES (?, ?, ?, NULL, NULL, NULL, 'standard', ?, ?, NULL, ?, ?, 0, ?, ?)
`);
const insertMany = sqlite.transaction((count: number) => {
  for (let index = 0; index < count; index++) {
    const day = String((index % 28) + 1).padStart(2, "0");
    const month = String((index % 12) + 1).padStart(2, "0");
    insert.run(
      `transaction-${String(index).padStart(7, "0")}`,
      budgetId,
      accountId,
      `2025-${month}-${day}`,
      `Transaction ${index}`,
      index % 3 === 0 ? -100 : 50,
      index % 5 === 0 ? "uncleared" : "cleared",
      now,
      now,
    );
  }
});

const fixtureRows = Number(process.env.SQLITE_ACCOUNT_QUERY_FIXTURE_ROWS ?? 100_000);
insertMany(fixtureRows);

const service = new SqliteAccountRegisterQueryService(sqlite);
const startedAt = performance.now();
const firstPage = await service.queryTransactions({ budgetId, accountId, limit: 150 });
const firstPageMs = performance.now() - startedAt;

assert.equal(firstPage.rows.length, 150);
assert.equal(firstPage.hasMore, true);
assert.ok(firstPage.nextCursor);
assert.equal(new Set(firstPage.rows.map((row) => row.id)).size, 150);

const secondPage = await service.queryTransactions({
  budgetId,
  accountId,
  limit: 150,
  before: firstPage.nextCursor!,
});
assert.equal(secondPage.rows.length, 150);
assert.equal(
  firstPage.rows.some((first) => secondPage.rows.some((second) => second.id === first.id)),
  false,
);

const summary = await service.getAccountSummary({ budgetId, accountId });
assert.equal(summary.transactionCount, fixtureRows);
const negativeRows = Math.ceil(fixtureRows / 3);
const expectedTransactionTotal = (fixtureRows - negativeRows) * 50 - negativeRows * 100;
assert.equal(summary.workingBalance, 10_000 + expectedTransactionTotal);

await assert.rejects(
  service.queryTransactions({ budgetId, accountId, limit: 251 }),
  /between 1 and 250/,
);

const plan = sqlite
  .prepare(`
    EXPLAIN QUERY PLAN
    SELECT id, date
    FROM transactions
    WHERE budget_id = ? AND account_id = ? AND is_deleted = 0
    ORDER BY date DESC, id DESC
    LIMIT 151
  `)
  .all(budgetId, accountId) as Array<{ detail: string }>;
assert.ok(
  plan.some((row) => row.detail.includes("idx_transactions_budget_account_active_date_id")),
  `Expected bounded account index in query plan:\n${plan.map((row) => row.detail).join("\n")}`,
);
assert.ok(
  firstPageMs < 250,
  `First bounded page took ${firstPageMs.toFixed(1)} ms; expected under 250 ms.`,
);

console.log(
  `Milestone 3 SQLite account-query foundation passed: ${fixtureRows.toLocaleString()} rows, first page ${firstPageMs.toFixed(1)} ms.`,
);
sqlite.close();
