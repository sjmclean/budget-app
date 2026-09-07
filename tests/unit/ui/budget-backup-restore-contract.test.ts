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
const restoreWorkflow = readFileSync(
  new URL(
    "../../../apps/web/src/features/budget/createLocalFirstBudgetFromBackup.ts",
    import.meta.url,
  ),
  "utf8",
);
const cloneWorker = readFileSync(
  new URL(
    "../../../apps/web/src/features/budget/backupClone.worker.ts",
    import.meta.url,
  ),
  "utf8",
);
const registryStore = readFileSync(
  new URL("../../../apps/web/src/stores/budgetRegistryStore.ts", import.meta.url),
  "utf8",
);

test("Budget Manager exposes backup restore without exposing restore points", () => {
  assert.match(selector, /<strong>Restore Backup<\/strong>/);
  assert.match(selector, /onClick=\{\(\) => setRestoreBackupOpen\(true\)\}/);
  assert.match(selector, /<BudgetBackupRestoreDialog/);
  assert.doesNotMatch(selector, /Restore Points|restorePoint/i);
});

test("Budget Manager restore creates a new budget instead of selecting a replacement", () => {
  assert.match(restoreDialog, /Create a new independent budget from a SQLite backup/);
  assert.match(restoreDialog, /Existing budgets will not be changed or replaced/);
  assert.match(restoreDialog, /Budget name/);
  assert.match(restoreDialog, /Restore as New Budget/);
  assert.match(restoreDialog, /restoreBackupAsNewBudget/);
  assert.doesNotMatch(restoreDialog, /Budget to restore|targetBudget|activateLocalBudget|restoreBudget\(/);
  assert.doesNotMatch(restoreDialog, /confirmDialog|tone:\s*"danger"/);
});

test("backup file validation and default naming remain launcher-safe", () => {
  assert.match(restoreDialog, /SQLite format 3\\u0000/);
  assert.match(restoreDialog, /This file is not a SQLite budget backup\./);
  assert.match(restoreDialog, /suggestRestoredBudgetName/);
  assert.match(restoreDialog, /\(Restored\)/);
  assert.match(restoreDialog, /disabled=\{busy \|\| !backupFile \|\| !budgetName\.trim\(\)\}/);
});

test("restore-as-new-budget provisions a fresh identity and publishes a fresh baseline", () => {
  assert.match(registryStore, /restoreBackupAsNewBudget/);
  assert.match(registryStore, /runWithExclusiveBudgetDatabase/);
  assert.match(restoreWorkflow, /createBudgetRegistryEntry/);
  assert.match(restoreWorkflow, /provisionFreshLocalFirstBudget\(budget\.id\)/);
  assert.match(restoreWorkflow, /cloneBudgetBackup/);
  assert.match(restoreWorkflow, /beginBaselineReplacement/);
  assert.match(restoreWorkflow, /commitBaselineReplacement/);
  assert.match(restoreWorkflow, /publishLocalBaseline/);
  assert.doesNotMatch(restoreWorkflow, /restoreBudget\(/);
});

test("clone worker rekeys budget ownership and drops old sync state", () => {
  assert.match(cloneWorker, /UPDATE \$\{quoteIdentifier\(tableName\)\} SET budget_id = \?/);
  assert.match(cloneWorker, /rewriteJsonColumns/);
  assert.match(cloneWorker, /DELETE FROM local_budget_outbox/);
  assert.match(cloneWorker, /DELETE FROM local_budget_sync_conflicts/);
  assert.match(cloneWorker, /DELETE FROM local_budget_projection_cache/);
  assert.match(cloneWorker, /\["budgetId", targetBudgetId\]/);
  assert.match(cloneWorker, /\["syncEpoch", targetSyncEpoch\]/);
  assert.match(cloneWorker, /\["pulledCursor", "0"\]/);
  assert.match(cloneWorker, /PRAGMA foreign_key_check/);
  assert.match(cloneWorker, /PRAGMA quick_check/);
});

test("failed restore removes only the provisional new budget", () => {
  assert.match(restoreWorkflow, /database\.deleteBudgetFile\(\)/);
  assert.match(restoreWorkflow, /provisioned\.relay\.deleteBudget\(budget\.id\)/);
  assert.match(restoreWorkflow, /deleteBudgetRegistryEntry\(storage, budget\.id\)/);
});
