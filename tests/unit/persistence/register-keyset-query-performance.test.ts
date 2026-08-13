import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workerSource = fs.readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

test("register keyset paging uses a tuple range matching the register index", () => {
  assert.match(
    workerSource,
    /where\.push\(\s*["'`]?\(transaction_row\.date,\s*transaction_row\.id\)\s*<\s*\(\?,\s*\?\)["'`]?\s*\)/,
    "descending register keyset paging should constrain the indexed (date,id) tuple",
  );

  assert.doesNotMatch(
    workerSource,
    /transaction_row\.date\s*<\s*\?\s+OR\s+\(transaction_row\.date\s*=\s*\?\s+AND\s+transaction_row\.id\s*<\s*\?\)/,
    "the OR cursor form prevents SQLite from using an efficient tuple range",
  );
});
