import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const rowSource = read(
  "apps/web/src/features/accounts/components/TransactionRow.tsx",
);
const editorSource = read(
  "apps/web/src/features/accounts/components/RegisterTransactionEditor.tsx",
);
const pageSource = read(
  "apps/web/src/pages/AccountRegisterPage.tsx",
);

test("register row carries shared editable field identity into edit activation", () => {
  assert.match(rowSource, /TransactionEditableField/);
  assert.match(rowSource, /resolveTransactionEditField/);

  for (const field of [
    "payee",
    "category",
    "memo",
    "checkNumber",
    "outflow",
    "inflow",
  ]) {
    assert.match(
      rowSource,
      new RegExp(`"${field}"`),
      `register row should resolve ${field}`,
    );
  }

  assert.doesNotMatch(rowSource, /onEditTransactionCategory/);
});

test("register page owns shared transaction edit intent instead of field special cases", () => {
  assert.match(pageSource, /TransactionEditIntent/);
  assert.match(
    pageSource,
    /useState<TransactionEditIntent>\(\{ field: "date" \}\)/,
  );
  assert.match(pageSource, /setTransactionEditIntent\(\{ field \}\)/);
  assert.match(pageSource, /editIntent=\{transactionEditIntent\}/);

  assert.doesNotMatch(pageSource, /editingTransactionFocusField/);
  assert.doesNotMatch(pageSource, /handleEditTransactionCategory/);
});

test("transaction edit row resolves shared behaviour for every editable field", () => {
  for (const field of [
    "date",
    "payee",
    "category",
    "memo",
    "checkNumber",
    "outflow",
    "inflow",
  ]) {
    assert.match(
      editorSource,
      new RegExp(
        `getTransactionFieldEditBehaviour\\(editIntent, "${field}"\\)`,
      ),
      `editor should resolve ${field} edit behaviour`,
    );
  }

  assert.match(editorSource, /selectOnInitialFocus=\{dateEditBehaviour\.selectOnInitialFocus\}/);
  assert.match(editorSource, /selectOnInitialFocus=\{payeeEditBehaviour\.selectOnInitialFocus\}/);
  assert.match(editorSource, /selectOnInitialFocus=\{categoryEditBehaviour\.selectOnInitialFocus\}/);
  assert.match(editorSource, /selectOnInitialFocus=\{outflowEditBehaviour\.selectOnInitialFocus\}/);
  assert.match(editorSource, /selectOnInitialFocus=\{inflowEditBehaviour\.selectOnInitialFocus\}/);

  assert.doesNotMatch(editorSource, /autoFocusField/);
});

test("memo and check number consume replacement selection only once per edit row", () => {
  assert.match(editorSource, /consumedTextSelections/);
  assert.match(
    editorSource,
    /consumedTextSelections\.current\.has\(field\)/,
  );
  assert.match(
    editorSource,
    /consumedTextSelections\.current\.add\(field\)/,
  );
});
