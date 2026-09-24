import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workerSource = readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

test("account register SQLite readback hydrates split Income for Month", () => {
  assert.match(
    workerSource,
    /SELECT split\.transaction_id AS transactionId, split\.id,[\s\S]*?split\.income_budget_month AS incomeBudgetMonth,[\s\S]*?FROM local_transaction_splits AS split/,
    "register split rows must read income_budget_month from SQLite",
  );
});

test("transaction batch verification compares parent and split Income for Month", () => {
  assert.match(
    workerSource,
    /normaliseTransactionRecord[\s\S]*?incomeBudgetMonth: transaction\.incomeBudgetMonth,[\s\S]*?incomeBudgetMonth: line\.incomeBudgetMonth,/,
    "post-write verification must include Income for Month metadata",
  );
});
