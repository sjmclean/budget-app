import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const schemaSource = fs.readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/registerSchema.ts",
    import.meta.url,
  ),
  "utf8",
);

const workerSource = fs.readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

test("account summary has a covering transaction index", () => {
  assert.match(
    schemaSource,
    /CREATE INDEX IF NOT EXISTS local_transactions_account_summary\s+ON local_transactions\s*\(\s*budget_id,\s*account_id,\s*amount,\s*cleared_status\s*\)/s,
    "account summary should scan a covering index instead of fetching every transaction table row",
  );
});

test("account summary remains derived directly from authoritative transactions", () => {
  assert.match(
    workerSource,
    /SUM\(CASE WHEN cleared_status IN \('cleared', 'reconciled'\) THEN amount ELSE 0 END\)/,
  );

  assert.match(
    workerSource,
    /SUM\(amount\)/,
  );

  assert.match(
    workerSource,
    /COUNT\(\*\) AS transactionCount/,
  );

  assert.match(
    workerSource,
    /FROM local_transactions WHERE budget_id = \? AND account_id = \?/,
    "the performance change must not replace ledger-derived balances with cached financial state",
  );
});
