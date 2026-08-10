import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync("apps/web/src/features/persistence/localFirst/localBudget.worker.ts", "utf8");
const schema = readFileSync("apps/web/src/features/persistence/localFirst/registerSchema.ts", "utf8");
const page = readFileSync("apps/web/src/pages/PayeeManagementPage.tsx", "utf8");
const commit = readFileSync("apps/web/src/features/accounts/transactionImportCommit.ts", "utf8");
const importDialog = readFileSync("apps/web/src/features/accounts/components/TransactionImportDialog.tsx", "utf8");
const styles = readFileSync("apps/web/src/styles/globals.css", "utf8");

for (const table of ["local_payee_aliases", "local_payee_recognition_rules", "local_payee_history"]) assert.match(schema, new RegExp(table));
assert.match(schema, /raw_payee_name TEXT/);
assert.match(commit, /rawPayee: candidate\.lifecycle\.source\.rawPayee/);
assert.match(importDialog, /resolvePayeeRecognition\(rawPayee, payeeOptions\)/);
assert.match(worker, /UPDATE local_scheduled_transactions SET payload_json/);
assert.match(worker, /BEGIN IMMEDIATE[\s\S]*local_payee_recognition_rules[\s\S]*COMMIT/);
assert.doesNotMatch(page, /<DndContext/);
assert.doesNotMatch(page, /@dnd-kit/);
assert.match(page, /Select \$\{payee\.name\} for merge/);
assert.match(page, /Payee to keep/);
assert.match(page, /Merge selected/);
assert.match(page, /Merge and update/);
assert.match(page, /Actions ▾/);
assert.match(page, /Merge with another payee/);
assert.match(page, />Preview</);
assert.match(page, /Merge Preview/);
assert.match(page, /Update linked register transactions/);
assert.match(worker, /sourcePayeeIds/);
for (const label of [
  "Rename Payee",
  "Add Alias",
  "Add Recognition Rule",
  "Merge Options",
  "Merge Preview",
  "Merge completed successfully",
  "Update linked register transactions",
  "Update scheduled transactions",
]) assert.match(page, new RegExp(label));
assert.match(worker, /linkedSchedules/);
assert.match(worker, /updateLinkedTransactions/);
assert.match(worker, /updateScheduledTransactions/);
assert.match(page, /Recognition Rules/);
assert.match(page, /Exact imported descriptions/);
assert.match(page, /const COMPACT_PAYEE_LIMIT = 10/);
assert.match(page, /Show all \$\{filteredPayees\.length\} payees/);
assert.doesNotMatch(page, /payee-management-pagination/);
assert.match(page, /payee-detail-tabs/);
assert.match(page, /payee-overview-grid/);
assert.ok(
  page.indexOf('payee-management-filters-primary') <
    page.indexOf('className="payee-management-list"'),
  "Payee filters must be rendered above the compact payee list.",
);
assert.match(styles, /\.payee-management-page \.payee-management-list\s*\{[\s\S]*?overflow: visible;/);
assert.match(styles, /\.payee-management-page \.payee-management-list::-webkit-scrollbar \{ display: none; \}/);

console.log("Milestone 4 payee persistence and workspace structural contracts passed.");
