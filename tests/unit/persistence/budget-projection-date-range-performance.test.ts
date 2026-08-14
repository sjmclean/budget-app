import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL(
    "../../../apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    import.meta.url,
  ),
  "utf8",
);

test("budget projection replay uses the existing date index for transaction facts", () => {
  const match = source.match(
    /function getBudgetProjectionDiagnostic\([\s\S]*?\n\}/,
  );

  assert.ok(match, "getBudgetProjectionDiagnostic should exist");

  const body = match[0];

  assert.doesNotMatch(
    body,
    /FROM local_transactions[\s\S]*?substr\(date,\s*1,\s*7\)\s*>=\s*\?/,
    "transaction replay should not filter the register through substr(date, 1, 7)",
  );

  assert.match(
    body,
    /FROM local_transactions[\s\S]*?date\s*>=\s*\?[\s\S]*?date\s*<\s*\?/,
    "transaction replay should use a half-open ISO date range",
  );
});

test("budget projection split replay is scoped by the transaction date range", () => {
  const match = source.match(
    /function getBudgetProjectionDiagnostic\([\s\S]*?\n\}/,
  );

  assert.ok(match, "getBudgetProjectionDiagnostic should exist");

  const body = match[0];

  assert.doesNotMatch(
    body,
    /FROM local_transaction_splits[\s\S]*?substr\(transaction_row\.date,\s*1,\s*7\)/,
    "split replay should not filter transaction dates through substr(date, 1, 7)",
  );

  assert.match(
    body,
    /FROM local_transaction_splits[\s\S]*?WHERE transaction_id\s*=\s*transaction_row\.id[\s\S]*?FROM local_transactions AS transaction_row[\s\S]*?transaction_row\.date\s*>=\s*\?[\s\S]*?transaction_row\.date\s*<\s*\?/,
    "split replay should be correlated to transactions selected by the half-open ISO date range",
  );
});
