import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync(
  "apps/web/src/features/persistence/localFirst/localBudget.worker.ts",
  "utf8",
);
const client = readFileSync(
  "apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts",
  "utf8",
);

for (const table of [
  "local_budget_months",
  "local_budget_assignments",
  "local_scheduled_transactions",
  "local_transaction_tag_definitions",
]) {
  assert.match(worker, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
}

assert.match(worker, /function migrateLegacyGenericEntities/);
assert.match(
  worker,
  /WHERE domain IN \('budgetMonths', 'scheduledTransactions', 'transactionTags'\)/,
);
assert.match(worker, /function writeNormalisedDomainEntity/);
assert.match(worker, /function readNormalisedDomainEntity/);
assert.match(worker, /function listNormalisedDomainEntities/);
assert.match(worker, /kind === "category-assignment"/);
assert.match(worker, /function applyMutationBatch/);

const assignmentWrite = client.slice(
  client.indexOf("async setCategoryAssignedValues"),
  client.indexOf("async getBudgetCategoryOptions"),
);
assert.match(assignmentWrite, /local\.mutateBatch/);
assert.match(assignmentWrite, /`assignment:\$\{input\.month\}:\$\{categoryId\}`/);
assert.match(assignmentWrite, /kind: "category-assignment"/);
assert.doesNotMatch(
  assignmentWrite,
  /writeEntity\(input\.budgetId, "budgetMonths", input\.month/,
);

console.log(
  "Milestone 4 normalized local budget domains contracts passed.",
);
