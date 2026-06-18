import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initDatabase } from "../packages/database/src/initDatabase.js";
import { IndexedTransactionSearchApplicationService } from "../packages/application/src/index.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const sqlite = new Database(
  join(mkdtempSync(join(tmpdir(), "v1212-search-")), "search.sqlite"),
);
initDatabase(sqlite);

sqlite
  .prepare(
    "INSERT INTO budgets (id, name, currency, created_at) VALUES (?, ?, ?, ?)",
  )
  .run("b1", "Budget", "AUD", Date.now());
sqlite
  .prepare(
    "INSERT INTO accounts (id, budget_id, name, type, participation, opening_balance, current_balance) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
  .run("a1", "b1", "Everyday", "checking", "on-budget", 0, 0);
sqlite
  .prepare(
    "INSERT INTO payees (id, budget_id, name, normalized_name, is_archived, is_transfer, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
  .run("p1", "b1", "Woolworths", "woolworths", 0, 0, Date.now(), Date.now());
sqlite
  .prepare(
    "INSERT INTO transaction_tags (id, budget_id, name, created_at) VALUES (?, ?, ?, ?)",
  )
  .run("tag1", "b1", "Groceries", Date.now());

const insert = sqlite.prepare(
  `INSERT INTO transactions (id, budget_id, account_id, payee_id, category_id, type, date, memo, amount, cleared_status, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
for (let i = 1; i <= 5; i += 1) {
  insert.run(
    `t${i}`,
    "b1",
    "a1",
    "p1",
    null,
    "outflow",
    `2026-06-${String(i).padStart(2, "0")}`,
    i === 3 ? "weekly shop" : "",
    -1000 * i,
    i % 2 === 0 ? "cleared" : "uncleared",
    0,
    Date.now() + i,
    Date.now() + i,
  );
}
sqlite
  .prepare(
    "INSERT INTO transaction_flags (id, transaction_id, colour, label, created_at) VALUES (?, ?, ?, ?, ?)",
  )
  .run("f1", "t3", "red", "Check", Date.now());
sqlite
  .prepare(
    "INSERT INTO transaction_tag_assignments (id, transaction_id, tag_id, created_at) VALUES (?, ?, ?, ?)",
  )
  .run("ta1", "t3", "tag1", Date.now());

const search = new IndexedTransactionSearchApplicationService(sqlite);
const page = search.search({
  budgetId: "b1",
  limit: 2,
  offset: 1,
  sortBy: "date",
  sortDirection: "asc",
});
assert(page.total === 5, "Expected total count independent of pagination");
assert(
  page.rows.length === 2 && page.rows[0].id === "t2",
  "Expected deterministic paginated date sort",
);

const flagged = search.search({ budgetId: "b1", flagColour: "red" });
assert(
  flagged.rows.length === 1 && flagged.rows[0].id === "t3",
  "Expected flag filter to find flagged transaction",
);

const taggedText = search.search({
  budgetId: "b1",
  tagId: "tag1",
  text: "weekly",
});
assert(
  taggedText.rows.length === 1 && taggedText.rows[0].id === "t3",
  "Expected combined tag/text search to work",
);

console.log("PASS: v1.2.12 indexed transaction search");
