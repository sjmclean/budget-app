import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createLocalFirstAccountRegisterQueryClient } from "../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url).includes("bootstrap")) throw new Error("offline bootstrap: use cached local generation");
  return new Response(JSON.stringify({ mutations: [], hasMore: false }), { status: 200 });
};
after(() => { globalThis.fetch = originalFetch; });

function harness(hooks: { open?: () => Promise<void>; sync?: () => Promise<void>; close?: () => Promise<void> } = {}) {
  const values = new Map([ ["budget-app.local-first.device-id", "test-device"], ...["A", "B"].map((id) => [`budget-app.local-first.sync-epoch.${id}`, "epoch"])]);
  const events: string[] = [];
  let owner: string | null = null;
  const client = createLocalFirstAccountRegisterQueryClient({} as never, {
    storage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } },
    tabSyncCoordinator: { run: async (_id, operation) => operation(), close() {} },
    databaseFactory: () => {
      let id = "";
      return {
        async open(input: { budgetId: string }) {
          assert.equal(owner, null, "only one database worker may own the pool");
          id = input.budgetId;
          owner = id;
          events.push(`open:${id}`);
          await hooks.open?.();
          return {};
        },
        async close() { await hooks.close?.(); events.push(`close:${id}`); owner = null; },
        async getSyncState() { return { syncEpoch: "epoch", pulledCursor: 0, baselineHash: "hash" }; },
        async readOutbox() { await hooks.sync?.(); return []; },
        async listAccountNavigation(budgetId: string) { assert.equal(budgetId, id); events.push(`read:${id}`); return []; },
        async getTransaction(budgetId: string) {
          assert.equal(budgetId, id);
          events.push(`get-transaction:${id}`);
          return null;
        },
      } as unknown as LocalBudgetDatabaseClient;
    },
  });
  return { client, events, owner: () => owner };
}

test("simultaneous requests for different budgets do not share the global opening promise", async () => {
  const { client, events } = harness();
  await Promise.all([client.listAccountNavigation("A"), client.listAccountNavigation("B")]);
  await client.releaseLocalDatabase!();
  assert.deepEqual(events, ["open:A", "read:A", "close:A", "open:B", "read:B", "close:B"]);
});

for (const phase of ["open", "sync"] as const) {
  test(`release during ${phase} drains the actual query before closing and rejects stale requests`, async () => {
    const started = deferred();
    const finish = deferred();
    const { client, events, owner } = harness({ [phase]: async () => { started.resolve(); await finish.promise; } });
    const query = client.listAccountNavigation("A");
    await started.promise;
    const release = client.releaseLocalDatabase!();
    assert.equal(owner(), "A");
    await assert.rejects(client.listAccountNavigation("B"), { code: "BUDGET_DATABASE_RELEASED" });
    finish.resolve();
    await query;
    await release;
    await client.releaseLocalDatabase!();
    assert.equal(owner(), null);
    assert.deepEqual(events, ["open:A", "read:A", "close:A"]);
    await client.activateLocalBudget!("B");
    await client.listAccountNavigation("B");
    await client.releaseLocalDatabase!();
    assert.equal(owner(), null);
  });
}

test("fire-and-forget prefetch is tracked through sync; released prefetch cannot reopen", async () => {
  const started = deferred();
  const finish = deferred();
  const { client, events, owner } = harness({ sync: async () => { started.resolve(); await finish.promise; } });
  client.prefetchAccountRegister({ budgetId: "A", accountId: "account", limit: 10, offset: 0 } as never);
  await started.promise;
  const released = client.releaseLocalDatabase!();
  client.prefetchAccountRegister({ budgetId: "B", accountId: "account" } as never);
  assert.equal(owner(), "A");
  finish.resolve();
  await released;
  assert.equal(owner(), null);
  assert.deepEqual(events, ["open:A", "close:A"]);
});

test("failed opening closes the unpublished worker and permits a fresh attempt", async () => {
  let fail = true;
  const { client, events } = harness({ open: async () => { if (fail) throw Object.assign(new Error("external owner"), { code: "SQLITE_DATABASE_BUSY" }); } });
  await assert.rejects(client.listAccountNavigation("A"), { code: "SQLITE_DATABASE_BUSY" });
  await client.releaseLocalDatabase!();
  fail = false;
  await client.activateLocalBudget!("B");
  await client.listAccountNavigation("B");
  await client.releaseLocalDatabase!();
  assert.deepEqual(events, ["open:A", "close:A", "open:B", "read:B", "close:B"]);
});

test("release propagates a close failure and does not admit a new owner", async () => {
  let fail = true;
  const { client, owner } = harness({ close: async () => { if (fail) throw new Error("close failed"); } });
  await client.listAccountNavigation("A");
  await assert.rejects(client.releaseLocalDatabase!(), /close failed/);
  await assert.rejects(client.runWithExclusiveLocalDatabase!(async () => assert.fail("must not run")), /close failed/);
  assert.equal(owner(), "A");
  fail = false;
  await client.releaseLocalDatabase!();
  assert.equal(owner(), null);
});


test("entity-id-first update routes ownership using the transaction input budget", async () => {
  const { client, events } = harness();

  await client.activateLocalBudget!("A");

  await assert.rejects(
    client.updateTransaction(
      "transaction-123",
      {
        budgetId: "A",
        accountId: "account-1",
        date: "2026-09-03",
        amount: -1000,
      },
    ),
    /The local transaction was not found/,
  );

  assert.equal(
    events.includes("get-transaction:A"),
    true,
    "the raw update path should be admitted for the active budget",
  );

  await assert.rejects(
    client.updateTransaction(
      "transaction-123",
      {
        budgetId: "B",
        accountId: "account-1",
        date: "2026-09-03",
        amount: -1000,
      },
    ),
    { code: "BUDGET_DATABASE_BUDGET_MISMATCH" },
  );

  await client.releaseLocalDatabase!();
});
