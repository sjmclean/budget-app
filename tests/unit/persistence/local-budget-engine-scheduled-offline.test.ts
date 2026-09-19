import assert from "node:assert/strict";
import Database from "better-sqlite3";
import test from "node:test";
import { flushPersistenceChanges, subscribePersistenceChanges } from "../../../apps/web/src/features/persistence/persistenceChangeBus.js";
import type { LocalBudgetMutation } from "../../../apps/web/src/features/persistence/localFirst/contracts.js";
import { createLocalBudgetRuntime } from "../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.js";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";

test("public engine creates a scheduled transaction locally while relay is unavailable", async () => {
  const budgetId = "offline-scheduled"; const syncEpoch = "epoch";
  const sqlite = new Database(":memory:");
  sqlite.exec("CREATE TABLE schedules(id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE outbox(mutation_id TEXT PRIMARY KEY, payload TEXT NOT NULL)");
  const database = {
    async open() { return {}; }, async close() {},
    async getSyncState() { return { budgetId, syncEpoch, baselineHash: "local", pulledCursor: 0 }; },
    async listEntities<T>() { return sqlite.prepare("SELECT payload FROM schedules ORDER BY id").all().map((row) => JSON.parse((row as { payload: string }).payload)) as T[]; },
    async mutate(mutation: LocalBudgetMutation) { sqlite.transaction(() => {
      sqlite.prepare("INSERT OR REPLACE INTO schedules VALUES (?, ?)").run(mutation.entityId, JSON.stringify(mutation.payload));
      sqlite.prepare("INSERT INTO outbox VALUES (?, ?)").run(mutation.mutationId, JSON.stringify(mutation));
    })(); return {}; },
  } as unknown as LocalBudgetDatabaseClient;
  const values = new Map([["budget-app.local-first.device-id", "device"], [`budget-app.local-first.sync-epoch.${budgetId}`, syncEpoch]]);
  const originalFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error("relay unavailable"); };
  const events: string[][] = []; const unsubscribe = subscribePersistenceChanges((event) => events.push([...event.scope.domains]));
  try {
    const engine = createLocalBudgetRuntime({} as Parameters<typeof createLocalBudgetRuntime>[0], { databaseFactory: () => database,
      storage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } },
      tabSyncCoordinator: { async run<T>(_id: string, operation: () => Promise<T>) { return operation(); }, close() {} } });
    const result = await engine.createScheduledTransaction(budgetId, { id: "schedule-a", accountId: "account-a",
      nextDueDate: "2026-10-01", frequency: "monthly", recurrenceKind: "rule", recurrenceAnchorDate: "2026-10-01",
      payee: "Rent", category: "Housing", outflow: 100, inflow: 0 });
    flushPersistenceChanges();
    assert.equal(result.some(({ id }) => id === "schedule-a"), true);
    const row = sqlite.prepare("SELECT payload FROM schedules WHERE id = ?").get("schedule-a") as { payload: string };
    assert.equal(JSON.parse(row.payload).id, "schedule-a");
    const outbox = sqlite.prepare("SELECT mutation_id AS id, payload FROM outbox").get() as { id: string; payload: string };
    assert.equal(JSON.parse(outbox.payload).mutationId, outbox.id);
    assert.deepEqual(events, [["scheduled-transactions"]]);
  } finally { unsubscribe(); globalThis.fetch = originalFetch; sqlite.close(); }
});
