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

test("budget projection opening balances use the account-date register range", () => {
  const match = source.match(
    /function getBudgetProjectionDiagnostic\([\s\S]*?\n\}/,
  );

  assert.ok(match, "getBudgetProjectionDiagnostic should exist");

  const body = match[0];

  assert.doesNotMatch(
    body,
    /opening_balance[\s\S]*?substr\(transaction_row\.date,\s*1,\s*7\)\s*<\s*\?/,
    "opening balances should not filter historical transactions through substr(date, 1, 7)",
  );

  assert.match(
    body,
    /opening_balance[\s\S]*?transaction_row\.date\s*<\s*\?/,
    "opening balances should use the existing account/date register index",
  );
});

test("opening balance replay passes the first day of the projection month", () => {
  const match = source.match(
    /function getBudgetProjectionDiagnostic\([\s\S]*?\n\}/,
  );

  assert.ok(match, "getBudgetProjectionDiagnostic should exist");

  const body = match[0];

  assert.match(
    body,
    /\[`\$\{firstMonth\}-01`,\s*budgetId\]/,
    "opening balance cutoff should be the first ISO date of the projection month",
  );
});
