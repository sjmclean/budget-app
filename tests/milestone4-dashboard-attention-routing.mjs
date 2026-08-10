import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync("apps/web/src/pages/DashboardPage.tsx", "utf8");
const worker = readFileSync("apps/web/src/features/persistence/localFirst/localBudget.worker.ts", "utf8");
const dialog = readFileSync("apps/web/src/features/accounts/components/TransactionImportDialog.tsx", "utf8");

assert.doesNotMatch(dashboard, /to="\/transactions"/);
assert.match(dashboard, /categoryFilter=uncategorised/);
assert.match(dashboard, /uncategorisedAccountId/);
assert.match(worker, /transaction_row\.amount < 0/);
assert.match(worker, /transaction_row\.transfer_account_id IS NULL/);
assert.match(worker, /local_transaction_splits/);
assert.match(worker, /account\.participation = 'on-budget'/);
assert.match(dialog, /Balance after import/);
assert.match(dialog, /loadAccountWorkingBalance/);

console.log("Milestone 4 dashboard attention routing contracts passed: aligned categorisation predicate and valid account route.");
