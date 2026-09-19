import assert from "node:assert/strict";
import test from "node:test";
import { flushPersistenceChanges, publishPersistenceChange, subscribeToPersistenceInterest } from "../../../apps/web/src/features/persistence/persistenceChangeBus.js";
import { notifyRemoteMutationsApplied } from "../../../apps/web/src/features/persistence/localFirst/mutationEvents.js";
import type { LocalBudgetMutation } from "../../../apps/web/src/features/persistence/localFirst/contracts.js";

function mutation(overrides: Partial<LocalBudgetMutation> = {}): LocalBudgetMutation {
  return {
    mutationId: "mutation-1", budgetId: "budget-x", syncEpoch: "epoch-1",
    deviceId: "device-b", deviceSequence: 1, baseCursor: 0,
    domain: "transactions", entityId: "tx-1", operation: "upsert",
    payload: { id: "tx-1", accountId: "account-a", date: "2026-09-10", categoryId: "groceries", amount: -1000 },
    createdAt: "2026-09-16T00:00:00.000Z", ...overrides,
  };
}

async function applyRemoteBatch(
  sqlite: Map<string, unknown>,
  mutations: readonly LocalBudgetMutation[],
): Promise<void> {
  // This models the production boundary: SQLite commit must complete before the
  // invalidation publisher is invoked.
  for (const item of mutations) {
    if (item.operation === "delete") sqlite.delete(item.entityId);
    else sqlite.set(item.entityId, item.payload);
  }
  notifyRemoteMutationsApplied(mutations[0]!.budgetId, mutations);
  flushPersistenceChanges();
}

test("remote committed transaction invalidates only its account/month/budget interests", async () => {
  const sqliteA = new Map<string, unknown>();
  let accountA = 0; let accountB = 0; let september = 0; let october = 0; let otherBudget = 0;
  const unsubscribers = [
    subscribeToPersistenceInterest({ budgetId: "budget-x", accountId: "account-a", domains: ["transactions"] }, () => { accountA += 1; }),
    subscribeToPersistenceInterest({ budgetId: "budget-x", accountId: "account-b", domains: ["transactions"] }, () => { accountB += 1; }),
    subscribeToPersistenceInterest({ budgetId: "budget-x", month: "2026-09", domains: ["budget"] }, () => { september += 1; }),
    subscribeToPersistenceInterest({ budgetId: "budget-x", month: "2026-10", domains: ["budget"] }, () => { october += 1; }),
    subscribeToPersistenceInterest({ budgetId: "budget-y", domains: ["transactions"] }, () => { otherBudget += 1; }),
  ];
  await applyRemoteBatch(sqliteA, [mutation()]);
  assert.ok(sqliteA.has("tx-1"), "authoritative state exists before observers run");
  assert.deepEqual({ accountA, accountB, september, october, otherBudget }, { accountA: 1, accountB: 0, september: 1, october: 0, otherBudget: 0 });
  unsubscribers.forEach((unsubscribe) => unsubscribe());
});

test("same remote batch unions independent changes and refreshes each receiver once", async () => {
  const sqliteA = new Map<string, unknown>();
  let a = 0; let b = 0;
  const stopA = subscribeToPersistenceInterest({ budgetId: "budget-x", accountId: "account-a", domains: ["transactions"] }, () => { a += 1; });
  const stopB = subscribeToPersistenceInterest({ budgetId: "budget-x", accountId: "account-b", domains: ["transactions"] }, () => { b += 1; });
  await applyRemoteBatch(sqliteA, [
    mutation(),
    mutation({ mutationId: "mutation-2", entityId: "tx-2", deviceId: "device-a", payload: { id: "tx-2", accountId: "account-b", date: "2026-10-01", amount: -2000 } }),
  ]);
  assert.deepEqual([...sqliteA.keys()].sort(), ["tx-1", "tx-2"]);
  assert.deepEqual({ a, b }, { a: 1, b: 1 });
  stopA(); stopB();
});

test("offline mutation remains local, then reconnect applies and notifies the peer", async () => {
  const deviceA = new Map<string, unknown>(); const deviceB = new Map<string, unknown>();
  const offlineMutation = mutation();
  deviceA.set(offlineMutation.entityId, offlineMutation.payload);
  assert.ok(deviceA.has("tx-1")); assert.equal(deviceB.has("tx-1"), false);
  let peerRefreshes = 0;
  const stop = subscribeToPersistenceInterest({ budgetId: "budget-x", accountId: "account-a", domains: ["transactions"] }, () => { peerRefreshes += 1; });
  await applyRemoteBatch(deviceB, [offlineMutation]);
  assert.deepEqual(deviceB.get("tx-1"), deviceA.get("tx-1"));
  assert.equal(peerRefreshes, 1);
  stop();
});

test("conflict winner application preserves scoped invalidation", async () => {
  const sqlite = new Map<string, unknown>();
  const winner = mutation({ mutationId: "remote-winner", baseCursor: 2 });
  let refreshes = 0;
  const stop = subscribeToPersistenceInterest({ budgetId: "budget-x", accountId: "account-a", domains: ["transactions"] }, () => { refreshes += 1; });
  await applyRemoteBatch(sqlite, [winner]);
  assert.deepEqual(sqlite.get("tx-1"), winner.payload);
  assert.equal(refreshes, 1);
  stop();
});

test("coalescing a wildcard and specific change still refreshes observers outside the specific id", () => {
  let outside = 0;
  const stop = subscribeToPersistenceInterest({ budgetId: "budget-x", accountId: "account-outside", domains: ["transactions"] }, () => { outside += 1; });
  publishPersistenceChange({ source: "local", scope: { budgetId: "budget-x", domains: ["transactions"] } });
  publishPersistenceChange({ source: "local", scope: { budgetId: "budget-x", domains: ["transactions"], accountIds: ["account-a"] } });
  flushPersistenceChanges();
  assert.equal(outside, 1);
  stop();
});
