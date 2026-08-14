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

function projectionDiagnosticBody(): string {
  const match = source.match(
    /function getBudgetProjectionDiagnostic\([\s\S]*?\n\}/,
  );

  assert.ok(match, "getBudgetProjectionDiagnostic should exist");
  return match[0];
}

test("budget projection hydrates split facts inside the transaction range query", () => {
  const body = projectionDiagnosticBody();

  assert.match(
    body,
    /json_group_array\(/,
    "projection transaction facts should aggregate split rows in SQLite",
  );

  assert.match(
    body,
    /json_object\([\s\S]*?'id'[\s\S]*?'categoryId'[\s\S]*?'transferAccountId'[\s\S]*?'amount'/,
    "projection split JSON should contain every engine-required split fact",
  );

  assert.match(
    body,
    /FROM local_transaction_splits[\s\S]*?WHERE transaction_id\s*=\s*transaction_row\.id[\s\S]*?ORDER BY id/,
    "projection split aggregation should retain deterministic split ID ordering",
  );
});

test("budget projection no longer performs a second split range query and Map hydration pass", () => {
  const body = projectionDiagnosticBody();

  assert.doesNotMatch(
    body,
    /const splitRows = resultRows</,
    "projection fact collection should not issue a separate split range query",
  );

  assert.doesNotMatch(
    body,
    /const splitsByTransaction = new Map/,
    "projection fact collection should not build a second split hydration map",
  );

  assert.doesNotMatch(
    body,
    /JOIN local_transactions AS parent ON parent\.id = split\.transaction_id/,
    "projection fact collection should not rescan the transaction range solely to load splits",
  );
});

test("budget projection parses the ordered split JSON into engine facts", () => {
  const body = projectionDiagnosticBody();

  assert.match(
    body,
    /JSON\.parse\(transaction\.splitsJson\)/,
    "projection transaction facts should parse the SQLite-produced split array",
  );
});
