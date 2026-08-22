import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const applicationContract = readFileSync(
  new URL(
    "../../../packages/application/src/accountRegister/AccountRegisterQueryPort.ts",
    import.meta.url,
  ),
  "utf8",
);

const registerSchema = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/registerSchema.ts",
    import.meta.url,
  ),
  "utf8",
);

const worker = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

test("account register query supports a bounded date range", () => {
  assert.match(
    applicationContract,
    /dateRange\?:\s*\{[\s\S]*?startDate:\s*string;[\s\S]*?endDate:\s*string;/,
  );

  assert.match(
    registerSchema,
    /dateRange\?:\s*\{[\s\S]*?startDate:\s*string;[\s\S]*?endDate:\s*string;/,
  );
});

test("SQLite transaction queries constrain both ends of an import evidence window", () => {
  const start = worker.indexOf("function queryTransactions(");
  const end = worker.indexOf("\nfunction getTransaction(", start);

  assert.ok(start >= 0);
  assert.ok(end > start);

  const query = worker.slice(start, end);

  assert.match(
    query,
    /transaction_row\.date >= \?/,
    "bounded register reads must constrain the oldest matching date",
  );

  assert.match(
    query,
    /transaction_row\.date <= \?/,
    "bounded register reads must constrain the newest matching date",
  );

  assert.match(
    query,
    /query\.dateRange\.startDate/,
  );

  assert.match(
    query,
    /query\.dateRange\.endDate/,
  );
});

test("bounded import evidence retains normal cursor pagination", () => {
  const start = worker.indexOf("function queryTransactions(");
  const end = worker.indexOf("\nfunction getTransaction(", start);
  const query = worker.slice(start, end);

  assert.match(
    query,
    /\(transaction_row\.date, transaction_row\.id\) < \(\?, \?\)/,
    "date-bounded reads must remain cursor pageable",
  );

  assert.match(
    query,
    /nextCursor:/,
    "the query must continue returning a cursor for later evidence pages",
  );

  assert.match(
    query,
    /hasMore:/,
    "the query must report whether further evidence pages exist",
  );
});
