import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import Database from "better-sqlite3";

const schemaSource = await readFile(
  new URL(
    "../apps/web/src/features/persistence/localFirst/registerSchema.ts",
    import.meta.url,
  ),
  "utf8",
);
const schema = schemaSource.match(
  /export const LOCAL_REGISTER_SCHEMA_SQL = `([\s\S]*?)`;/,
)?.[1];
assert.ok(schema, "The local register schema must remain an inspectable SQL contract.");

const database = new Database(":memory:");
database.pragma("foreign_keys = ON");
database.exec(schema);

const accountInsert = database.prepare(`
  INSERT INTO local_accounts(
    id, budget_id, name, type, participation, opening_balance,
    currency_code, created_at, closed_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
accountInsert.run(
  "account-1", "budget-1", "Everyday", "checking", "on-budget",
  10_000, "AUD", new Date().toISOString(), null,
);

const transactionInsert = database.prepare(`
  INSERT INTO local_transactions(
    id, budget_id, account_id, date, amount, memo, check_number,
    cleared_status, payee_id, payee_name, category_id, category_name,
    transfer_account_id, transfer_transaction_id, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertMany = database.transaction(() => {
  for (let index = 0; index < 100_000; index += 1) {
    const day = String((index % 28) + 1).padStart(2, "0");
    transactionInsert.run(
      `transaction-${String(index).padStart(6, "0")}`,
      "budget-1",
      "account-1",
      `2026-07-${day}`,
      index % 2 === 0 ? -1250 : 2400,
      `Memo ${index}`,
      null,
      index % 3 === 0 ? "cleared" : "uncleared",
      `payee-${index % 100}`,
      `Payee ${index % 100}`,
      `category-${index % 50}`,
      `Category ${index % 50}`,
      null,
      null,
      new Date().toISOString(),
    );
  }
});
insertMany();

const startedAt = performance.now();
const firstPage = database.prepare(`
  SELECT id, date, amount, payee_name AS payeeName
  FROM local_transactions
  WHERE budget_id = ? AND account_id = ?
  ORDER BY date DESC, id DESC
  LIMIT 151
`).all("budget-1", "account-1");
const durationMs = performance.now() - startedAt;

assert.equal(firstPage.length, 151);
assert.ok(
  durationMs < 100,
  `The indexed 100,000-row first page took ${durationMs.toFixed(1)} ms.`,
);

const queryPlan = database.prepare(`
  EXPLAIN QUERY PLAN
  SELECT id FROM local_transactions
  WHERE budget_id = ? AND account_id = ?
  ORDER BY date DESC, id DESC
  LIMIT 151
`).all("budget-1", "account-1");
assert.match(JSON.stringify(queryPlan), /local_transactions_register/);

const worker = await readFile(
  new URL(
    "../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);
for (const contract of [
  "BEGIN IMMEDIATE",
  "local_budget_outbox",
  "queryTransactions",
  "getAccountSummary",
  "writeTransaction",
  "deleteTransaction",
  "STALE_SYNC_EPOCH",
]) {
  assert.match(worker, new RegExp(contract));
}
assert.match(worker, /LIMIT \? OFFSET \?/);
assert.match(worker, /Math\.min\(250/);

database.close();
console.log(
  `Milestone 4 local register engine passed: 100,000 rows, indexed first page ${durationMs.toFixed(1)} ms.`,
);
