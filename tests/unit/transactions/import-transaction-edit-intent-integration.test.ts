import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "apps/web/src/features/accounts/components/TransactionImportDialog.tsx",
  "utf8",
);

test("import review derives shared edit intent from existing payee/category edit state", () => {
  assert.match(
    source,
    /type TransactionEditIntent/,
  );

  assert.match(
    source,
    /activeProposedTransactionEdit\s*\?\s*\{ field: activeProposedTransactionEdit\.field \}/,
  );

  assert.match(
    source,
    /getTransactionFieldEditBehaviour\(\s*proposedTransactionEditIntent,\s*"payee",?\s*\)/,
  );

  assert.match(
    source,
    /getTransactionFieldEditBehaviour\(\s*proposedTransactionEditIntent,\s*"category",?\s*\)/,
  );
});

test("import payee editors consume shared replacement behaviour", () => {
  const matches = source.match(
    /selectOnInitialFocus=\{\s*proposedPayeeEditBehaviour\.selectOnInitialFocus\s*\}/g,
  );

  assert.equal(matches?.length, 2);
});

test("import category editors consume shared replacement behaviour", () => {
  const matches = source.match(
    /selectOnInitialFocus=\{\s*proposedCategoryEditBehaviour\.selectOnInitialFocus\s*\}/g,
  );

  assert.equal(matches?.length, 2);
});

test("import edit scope remains payee and category only", () => {
  assert.match(
    source,
    /type ProposedTransactionEditField = "payee" \| "category"/,
  );

  assert.doesNotMatch(
    source,
    /type ProposedTransactionEditField = [^;]*(date|outflow|inflow)/,
  );
});
