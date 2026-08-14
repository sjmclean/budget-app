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

test("budget projection split replay uses the parent date index", () => {
  const match = source.match(
    /function getBudgetProjectionDiagnostic\([\s\S]*?\n\}/,
  );

  assert.ok(match, "getBudgetProjectionDiagnostic should exist");

  const body = match[0];

  assert.doesNotMatch(
    body,
    /FROM local_transaction_splits[\s\S]*?substr\(parent\.date,\s*1,\s*7\)\s*>=\s*\?/,
    "split replay should not filter parent transactions through substr(date, 1, 7)",
  );

  assert.match(
    body,
    /FROM local_transaction_splits[\s\S]*?parent\.date\s*>=\s*\?[\s\S]*?parent\.date\s*<\s*\?/,
    "split replay should use a half-open parent ISO date range",
  );
});
