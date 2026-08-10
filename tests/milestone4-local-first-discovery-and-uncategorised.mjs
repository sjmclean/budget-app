import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(
  "apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
  "utf8",
);
const sidebar = readFileSync("apps/web/src/layouts/Sidebar.tsx", "utf8");
const register = readFileSync("apps/web/src/pages/AccountRegisterPage.tsx", "utf8");
const replication = readFileSync(
  "apps/web/src/features/persistence/replicationService.ts",
  "utf8",
);
const settings = readFileSync("apps/web/src/pages/SettingsPage.tsx", "utf8");
const auth = readFileSync("apps/server/src/authStore.mjs", "utf8");

for (const requiredPredicate of [
  /transaction_row\.amount < 0/,
  /transaction_row\.transfer_account_id IS NULL/,
  /NOT EXISTS \(\s*SELECT 1 FROM local_transaction_splits/s,
]) {
  assert.match(worker, requiredPredicate);
}
assert.match(sidebar, /categoryFilter=uncategorised/);
assert.match(register, /useSearchParams\(\)/);
assert.match(register, /requestedCategoryFilter === "uncategorised"/);
assert.doesNotMatch(
  replication,
  /Legacy browser-key replication is disabled for the local-first SQLite runtime\./,
);
assert.match(replication, /listAccountNavigation\(budgetId\)/);
assert.match(replication, /updateBudgetMetadata\(\{/);
assert.match(settings, /Local SQLite baseline and mutation relay status/);
assert.match(auth, /LEFT JOIN local_first_sync_epochs local_epoch/);
assert.match(auth, /local_baseline\.baseline_id IS NOT NULL/);
assert.match(auth, /local_metadata\.budget_name/);

console.log("Milestone 4 local-first discovery, sync status, and uncategorised drill-down passed.");
