import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createLocalFirstRelayStore } from "../apps/server/src/localFirstRelayStore.mjs";
import { readFileSync } from "node:fs";

const runtime = readFileSync(
  new URL("../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts", import.meta.url),
  "utf8",
);
const worker = readFileSync(
  new URL("../apps/web/src/features/persistence/localFirst/localBudget.worker.ts", import.meta.url),
  "utf8",
);
const launcher = readFileSync(
  new URL("../apps/web/src/features/budget/ynab4LauncherImport.ts", import.meta.url),
  "utf8",
);
const lifecycleClient = readFileSync(
  new URL("../apps/web/src/features/persistence/localFirst/budgetLifecycleControlPlaneClient.ts", import.meta.url),
  "utf8",
);

for (const contract of [
  "async exportBudget(budgetId)",
  "async restoreBudget(budgetId, file)",
  "async resetBudget(budgetId)",
  "async deleteBudget(budgetId)",
  "prepareBaselineExport",
  "beginBaselineReplacement",
  "commitBaselineReplacement",
  "publishLocalBaseline",
]) {
  assert.ok(runtime.includes(contract), `Missing local lifecycle contract: ${contract}`);
}
assert.match(worker, /case "deleteBudgetFile"/);
assert.doesNotMatch(launcher, /createHostedSqliteImportClient/);
assert.doesNotMatch(launcher, /useHostedSqlite/);
assert.match(launcher, /hosted SQLite import has been retired/);
assert.match(lifecycleClient, /\/api\/local-first\/budget\?budgetId=/);

const directory = mkdtempSync(join(tmpdir(), "local-first-lifecycle-"));
const database = new Database(":memory:");
try {
  const relay = createLocalFirstRelayStore(database, {
    blobDirectory: directory,
  });
  relay.resetEpoch("budget-lifecycle", 1);
  relay.updateBudgetMetadata(
    "budget-lifecycle",
    { budgetName: "Lifecycle Budget", currency: "AUD" },
  );
  assert.equal(
    database.prepare(
      "SELECT COUNT(*) AS count FROM local_first_sync_epochs WHERE budget_id = ?",
    ).get("budget-lifecycle").count,
    1,
  );

  const result = relay.deleteBudget("budget-lifecycle");
  assert.equal(result.deleted, true);
  for (const table of [
    "local_first_sync_epochs",
    "local_first_baselines",
    "local_first_mutations",
    "local_first_budget_metadata",
  ]) {
    assert.equal(
      database.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE budget_id = ?`)
        .get("budget-lifecycle").count,
      0,
      `${table} retained deleted budget state.`,
    );
  }
} finally {
  database.close();
  rmSync(directory, { recursive: true, force: true });
}

console.log(
  "Milestone 4 local-first lifecycle passed: local backup/restore/reset/delete, relay cleanup, and no hosted YNAB4 escape hatch.",
);
