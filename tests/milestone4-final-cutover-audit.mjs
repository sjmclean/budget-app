import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync(
  new URL("../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts", import.meta.url),
  "utf8",
);
const worker = readFileSync(
  new URL("../apps/web/src/features/persistence/localFirst/localBudget.worker.ts", import.meta.url),
  "utf8",
);
const replication = readFileSync(
  new URL("../apps/web/src/features/persistence/replicationService.ts", import.meta.url),
  "utf8",
);
const configured = readFileSync(
  new URL("../apps/web/src/features/persistence/configuredPersistenceProvider.ts", import.meta.url),
  "utf8",
);
const lifecycle = readFileSync(
  new URL("../apps/web/src/features/persistence/localFirst/budgetLifecycleControlPlaneClient.ts", import.meta.url),
  "utf8",
);

const localDataOperations = [
  "getAccountRegisterBootstrap", "getAccountSummary", "queryTransactions",
  "addTransaction", "commitTransactionBatch", "moveTransactions",
  "updateTransaction", "toggleTransactionCleared", "deleteTransaction",
  "listAccounts", "listAccountNavigation", "createAccount", "updateAccount",
  "setAccountClosed", "deleteAccount", "getBudgetMonthView",
  "setCategoryAssignedValues", "getBudgetCategoryOptions", "mutateCategory",
  "getCategoryMergePreview", "listPayees", "createPayee", "updatePayee",
  "setPayeeArchived", "mergePayees", "listTransactionTags",
  "replaceTransactionTags", "listScheduledTransactions",
  "createScheduledTransaction", "updateScheduledTransaction",
  "deleteScheduledTransaction", "advanceScheduledTransaction",
  "renameScheduledPayeeReferences", "reassignScheduledPayeeReferences",
  "getFinancialOverview", "getMonthlySpending",
  "getMonthlyCategoryTransactions",
];
for (const operation of localDataOperations) {
  assert.match(
    runtime,
    new RegExp(`(?:async )?${operation}\\s*\\(`),
    `${operation} still lacks a local-first implementation.`,
  );
}

assert.match(configured, /syncArchitecture: "local-first-relay"/);
assert.doesNotMatch(configured, /createHostedAccountRegisterQueryClient/);
assert.doesNotMatch(runtime, /\.\.\.fallback/);
assert.doesNotMatch(runtime, /fallback\./);
assert.match(runtime, /lifecycle\.getBudgetExportUrl/);
assert.match(lifecycle, /Budget reads and writes must never be added here/);
assert.doesNotMatch(lifecycle, /\/accounts|\/transactions|\/months|\/payees|\/categories/);
assert.match(replication, /provider\.syncArchitecture === "local-first-relay"/);
assert.match(replication, /createLocalFirstRelayTransport/);
assert.match(replication, /setInterval/);
assert.match(replication, /addEventListener\?\.\("online"/);
assert.match(replication, /visibilityState === "visible"/);
assert.match(runtime, /pushMutations/);
assert.match(runtime, /pullMutations/);
assert.match(worker, /"STALE_SYNC_EPOCH"/);
assert.match(worker, /LIMIT \?/);
assert.match(worker, /LIMIT 250/);
assert.match(worker, /IMPORT_BATCH_TOO_LARGE/);
assert.doesNotMatch(runtime, /File\.text\(/);
assert.doesNotMatch(runtime, /crypto\.randomUUID\(\)/);
assert.match(runtime, /createRuntimeUuid\(\)/);
assert.doesNotMatch(worker, /SELECT \* FROM local_transactions(?![^]*LIMIT)/);

console.log(
  `Milestone 4 final cutover audit passed: ${localDataOperations.length} local data operations, one sync protocol, bounded reads, and stale-epoch refusal.`,
);
