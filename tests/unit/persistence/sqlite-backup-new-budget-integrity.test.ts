import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("SQLite backup clone rehomes canonical budget scope and resets source sync state", async () => {
  const worker = await readFile(
    "apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
    "utf8",
  );

  assert.match(worker, /function rehomeImportedBudget\(/);
  for (const table of [
    "local_budget_months",
    "local_budget_assignments",
    "local_budget_category_policies",
    "local_scheduled_transactions",
    "local_transaction_tag_definitions",
    "local_accounts",
    "local_payees",
    "local_payee_aliases",
    "local_payee_recognition_rules",
    "local_payee_history",
    "local_payee_duplicate_suppressions",
    "local_categories",
    "local_category_goals",
    "local_transactions",
    "local_transaction_attachments",
  ]) {
    assert.match(worker, new RegExp(`"${table}"`));
  }

  assert.match(worker, /DELETE FROM local_budget_outbox/);
  assert.match(worker, /DELETE FROM local_budget_sync_conflicts/);
  assert.match(worker, /writeMetadata\("budgetId", targetBudgetId\)/);
  assert.match(worker, /writeMetadata\("syncEpoch", syncEpoch\)/);
  assert.match(worker, /writeMetadata\("pulledCursor", "0"\)/);
  assert.match(worker, /writeMetadata\("baselineHash", ""\)/);
  assert.match(worker, /PRAGMA quick_check/);
  assert.match(worker, /PRAGMA foreign_key_check/);
});

test("launcher clone uses fresh provisioning and publishes registry only after baseline publication", async () => {
  const source = await readFile(
    "apps/web/src/features/budget/sqliteBackupLauncherImport.ts",
    "utf8",
  );

  const provision = source.indexOf("provisionFreshLocalFirstBudget(budget.id)");
  const clone = source.indexOf("await database.commitBaselineClone()");
  const publish = source.indexOf("await publishLocalBaseline(");
  const registry = source.indexOf(
    "storage.setItem(BUDGET_REGISTRY_STORAGE_KEY, serialized)",
  );

  assert.ok(provision >= 0);
  assert.ok(clone > provision);
  assert.ok(publish > clone);
  assert.ok(registry > publish);
  assert.match(source, /await provisioned\.relay\.deleteBudget\(budget\.id\)/);
  assert.match(source, /await database\.deleteBudgetFile\(\)/);
});

test("in-place restore remains a separate existing-budget recovery operation", async () => {
  const client = await readFile(
    "apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts",
    "utf8",
  );
  assert.match(client, /async restoreBudget\(budgetId, file\)/);
  assert.match(
    client,
    /createRestorePointReplacement\([\s\S]*?\.restoreDatabase\(budgetId, file\)/,
  );
});
