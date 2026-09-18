import assert from "node:assert/strict";
import test from "node:test";
import { LocalBudgetCommandExecutor } from "../../../apps/web/src/features/persistence/localFirst/engine/localBudgetCommandExecutor.js";
import { LocalBudgetMutationContext } from "../../../apps/web/src/features/persistence/localFirst/engine/mutationContext.js";
import { committedCommandResult } from "../../../apps/web/src/features/persistence/localFirst/engine/commandContext.js";
import { mergePersistenceChangeScopes } from "../../../apps/web/src/features/persistence/localFirst/persistenceChangeImpact.js";
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
  const executor = new LocalBudgetCommandExecutor();
  const changes: unknown[] = [];
  const unsubscribe = subscribePersistenceChanges((change) => { changes.push(change); });
  const result = await executor.execute("transaction.update:one", { execute: async () => {
    const committed = [
      mutations.createMutation("budget-a", "transactions", "tx-a", "upsert", { accountId: "account-a" }),
      mutations.createMutation("budget-a", "transactionTags", "tags", "upsert", []),
    ];
    return committedCommandResult("committed", committed, mergePersistenceChangeScopes("budget-a",
      { budgetId: "budget-a", domains: ["transactions"], accountIds: ["account-a"] },
      { budgetId: "budget-a", domains: ["budget"], months: ["2026-09"] }));
  }});
  flushPersistenceChanges();
  unsubscribe();
  assert.equal(result.result, "committed");
  assert.equal(result.mutationIds.length, 2);
  assert.deepEqual(result.change.domains, ["budget", "transactions"]);
  assert.equal(changes.length, 1);
});

test("executor reports no success and publishes nothing when the worker operation fails", async () => {
  const mutations = context();
  const executor = new LocalBudgetCommandExecutor();
  let publications = 0;
  const unsubscribe = subscribePersistenceChanges(() => { publications += 1; });
  await assert.rejects(() => executor.execute("transaction.update:failed", { execute: async () => {
    mutations.createMutation("budget-a", "transactions", "tx-a", "upsert", {});
    throw new Error("worker rollback");
  }}), /worker rollback/);
  flushPersistenceChanges();
  unsubscribe();
  assert.equal(publications, 0);
});

test("executor publishes nothing for a successful empty change", async () => {
  const executor = new LocalBudgetCommandExecutor();
  let publications = 0;
  const unsubscribe = subscribePersistenceChanges(() => { publications += 1; });
  const result = await executor.execute("transaction.no-op", {
    execute: async () => committedCommandResult("unchanged", [], {
      budgetId: "budget-a",
      domains: [],
    }),
  });
  flushPersistenceChanges();
  unsubscribe();
  assert.equal(result.result, "unchanged");
  assert.deepEqual(result.mutationIds, []);
  assert.equal(publications, 0);
});
