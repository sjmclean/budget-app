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
    /activeProposedTransactionEdit\.field === "memo"\s*\?\s*null\s*:\s*\{ field: activeProposedTransactionEdit\.field \}/,
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

test("import edit scope adds memo without broadening editable transaction fields", () => {
  assert.match(
    source,
    /type ProposedTransactionEditField = "payee" \| "category" \| "memo"/,
  );

  assert.doesNotMatch(
    source,
    /type ProposedTransactionEditField = [^;]*(date|outflow|inflow)/,
  );

  assert.match(source, /"Add Memo"/);
  assert.match(source, /"Edit Memo"/);
  assert.match(source, />\s*Save\s*</);
  assert.match(source, />\s*Cancel\s*</);
  assert.match(source, /event\.key === "Enter"/);
  assert.match(source, /event\.key === "Escape"/);
});
