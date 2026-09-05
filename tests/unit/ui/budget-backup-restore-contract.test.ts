import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const selector = readFileSync(
  new URL("../../../apps/web/src/pages/BudgetSelectorPage.tsx", import.meta.url),
  "utf8",
);
const restoreDialog = readFileSync(
  new URL(
    "../../../apps/web/src/pages/budgetSelector/BudgetBackupRestoreDialog.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("Budget Manager exposes backup restore without exposing restore points", () => {
  assert.match(selector, /<strong>Restore Backup<\/strong>/);
  assert.match(selector, /onClick=\{\(\) => setRestoreBackupOpen\(true\)\}/);
  assert.match(selector, /<BudgetBackupRestoreDialog/);
  assert.doesNotMatch(selector, /Restore Points|restorePoint/i);
});

test("backup restore requires a selected existing budget and SQLite backup", () => {
  assert.match(restoreDialog, /const targetBudget = budgets\.find\(\(budget\) => budget\.id === budgetId\)/);
  assert.match(restoreDialog, /Choose the existing budget this backup belongs to\./);
  assert.match(restoreDialog, /SQLite format 3\\u0000/);
  assert.match(restoreDialog, /This file is not a SQLite budget backup\./);
  assert.match(restoreDialog, /disabled=\{busy \|\| !targetBudget \|\| !backupFile\}/);
});

test("backup restore reuses the lifecycle restore path and releases ownership on failure", () => {
  assert.match(restoreDialog, /await queries\.activateLocalBudget\(targetBudget\.id\);/);
  assert.match(restoreDialog, /await queries\.restoreBudget\(targetBudget\.id, backupFile\);/);
  assert.match(restoreDialog, /await queries\.releaseLocalDatabase\(\);/);
  assert.match(restoreDialog, /if \(activated\)/);
  assert.match(restoreDialog, /onRestored\(targetBudget\.id\);/);
  assert.match(
    restoreDialog,
    /backup belongs to this budget before replacing anything/i,
  );
});
