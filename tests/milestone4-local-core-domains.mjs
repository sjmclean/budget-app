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

for (const contract of [
  "listAccountNavigation",
  "getBudgetMonthView",
  "setCategoryAssignedValues",
  "getBudgetCategoryOptions",
  "mutateCategory",
  "listPayees",
  "createPayee",
  "updatePayee",
  "setPayeeArchived",
  "mergePayees",
  "listTransactionTags",
  "replaceTransactionTags",
  "listScheduledTransactions",
  "createScheduledTransaction",
  "updateScheduledTransaction",
  "deleteScheduledTransaction",
  "advanceScheduledTransaction",
  "renameScheduledPayeeReferences",
  "reassignScheduledPayeeReferences",
]) {
  assert.match(runtime, new RegExp(`\\b${contract}\\b`), `${contract} must use the local runtime.`);
}
assert.match(runtime, /budgetMonths: true/);
assert.match(runtime, /scheduledTransactions: true/);
assert.match(runtime, /writeEntity[\s\S]*synchronise/);
assert.match(worker, /LEFT JOIN local_transactions/);
assert.match(worker, /UPDATE local_transactions SET payee_id = \?, payee_name = \?/);
assert.match(worker, /case "listEntities"/);
assert.match(worker, /case "mergePayees"/);
assert.match(worker, /mutation\.domain === "payees"/);

console.log(
  "Milestone 4 local core-domain contracts passed: navigation, budget, categories, payees, schedules, tags, and relay-backed mutations.",
);
