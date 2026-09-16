import assert from "node:assert/strict";
import test from "node:test";
import { LocalBudgetCommandExecutor } from "../../../apps/web/src/features/persistence/localFirst/engine/localBudgetCommandExecutor.js";
import { LocalBudgetMutationContext } from "../../../apps/web/src/features/persistence/localFirst/engine/mutationContext.js";
import { LocalBudgetCommandContext } from "../../../apps/web/src/features/persistence/localFirst/engine/commandContext.js";
import { createDomainCommandHandler } from "../../../apps/web/src/features/persistence/localFirst/engine/domainCommandHandlers.js";
import { flushPersistenceChanges, subscribePersistenceChanges } from "../../../apps/web/src/features/persistence/persistenceChangeBus.js";

function context() {
  const values = new Map<string, string>();
  return new LocalBudgetMutationContext({
    storage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } },
    deviceId: "device-a",
    currentSyncEpoch: () => "epoch-a",
    currentBaseCursor: () => 7,
  });
}

test("executor returns committed mutation ids and publishes one unioned change", async () => {
  const mutations = context();
  const commandContext = new LocalBudgetCommandContext(mutations);
  const executor = new LocalBudgetCommandExecutor();
  const changes: unknown[] = [];
  const unsubscribe = subscribePersistenceChanges((change) => { changes.push(change); });
  const result = await executor.execute("transaction.update:one", createDomainCommandHandler({
    budgetId: "budget-a", context: commandContext, operation: async () => {
    mutations.createMutation("budget-a", "transactions", "tx-a", "upsert", { accountId: "account-a" });
    mutations.createMutation("budget-a", "transactionTags", "tags", "upsert", []);
    commandContext.recordCommittedChange("budget-a", { domains: ["transactions"], accountIds: ["account-a"] });
    commandContext.recordCommittedChange("budget-a", { domains: ["budget"], months: ["2026-09"] });
    return "committed";
  }}));
  flushPersistenceChanges();
  unsubscribe();
  assert.equal(result.result, "committed");
  assert.equal(result.mutationIds.length, 2);
  assert.deepEqual(result.change.domains, ["budget", "transactions"]);
  assert.equal(changes.length, 1);
});

test("executor reports no success and publishes nothing when the worker operation fails", async () => {
  const mutations = context();
  const commandContext = new LocalBudgetCommandContext(mutations);
  const executor = new LocalBudgetCommandExecutor();
  let publications = 0;
  const unsubscribe = subscribePersistenceChanges(() => { publications += 1; });
  await assert.rejects(() => executor.execute("transaction.update:failed", createDomainCommandHandler({
    budgetId: "budget-a", context: commandContext, operation: async () => {
    mutations.createMutation("budget-a", "transactions", "tx-a", "upsert", {});
    commandContext.recordCommittedChange("budget-a", { domains: ["transactions"] });
    throw new Error("worker rollback");
  }})), /worker rollback/);
  flushPersistenceChanges();
  unsubscribe();
  assert.equal(publications, 0);
});
