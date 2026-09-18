import assert from "node:assert/strict";
import Database from "better-sqlite3";
import test from "node:test";

import { flushPersistenceChanges, subscribePersistenceChanges } from "../../../apps/web/src/features/persistence/persistenceChangeBus.js";
import type { LocalBudgetMutation } from "../../../apps/web/src/features/persistence/localFirst/contracts.js";
import { createLocalBudgetRuntime } from "../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.js";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";
import type { LocalPayeeRecord } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";

test("LocalBudgetEngine creates a payee locally while the relay is unavailable", async () => {
  const budgetId = "offline-payee-budget";
  const syncEpoch = "offline-payee-epoch";
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE payees (id TEXT PRIMARY KEY, budget_id TEXT NOT NULL, name TEXT NOT NULL, note TEXT NOT NULL, archived INTEGER NOT NULL);
    CREATE TABLE outbox (mutation_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL);
  `);
  const database = {
    async open() { return {}; },
    async close() {},
    async getSyncState() { return { budgetId, syncEpoch, baselineHash: "local", pulledCursor: 0 }; },
    async listPayees(id: string, archived: boolean) {
      return sqlite.prepare("SELECT id, budget_id AS budgetId, name, note, archived FROM payees WHERE budget_id = ? AND archived = ? ORDER BY id")
        .all(id, archived ? 1 : 0) as LocalPayeeRecord[];
    },
    async writePayee(payee: LocalPayeeRecord, mutation: LocalBudgetMutation) {
      sqlite.transaction(() => {
        sqlite.prepare("INSERT INTO payees VALUES (?, ?, ?, ?, ?)").run(payee.id, payee.budgetId, payee.name, payee.note, payee.archived ? 1 : 0);
        sqlite.prepare("INSERT INTO outbox VALUES (?, ?)").run(mutation.mutationId, JSON.stringify(mutation));
      })();
      return {};
    },
  } as unknown as LocalBudgetDatabaseClient;
  const values = new Map<string, string>([
    ["budget-app.local-first.device-id", "offline-payee-device"],
    [`budget-app.local-first.sync-epoch.${budgetId}`, syncEpoch],
  ]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("relay unavailable"); };
  const changes: { readonly scope: { readonly domains: readonly string[] } }[] = [];
  const unsubscribe = subscribePersistenceChanges((change) => { changes.push(change); });
  try {
    const engine = createLocalBudgetRuntime({} as Parameters<typeof createLocalBudgetRuntime>[0], {
      databaseFactory: () => database,
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value); },
      },
      tabSyncCoordinator: {
        async run<T>(_id: string, operation: () => Promise<T>) { return operation(); },
        close() {},
      },
    });
    const payees = await engine.createPayee(budgetId, " Offline shop ", "payee-a");
    flushPersistenceChanges();
    assert.equal(payees.some(({ id, name }) => id === "payee-a" && name === "Offline shop"), true);
    assert.deepEqual(sqlite.prepare("SELECT name, archived FROM payees WHERE id = ?").get("payee-a"), { name: "Offline shop", archived: 0 });
    const outbox = sqlite.prepare("SELECT mutation_id AS mutationId, payload_json AS payloadJson FROM outbox").get() as { mutationId: string; payloadJson: string };
    assert.equal(JSON.parse(outbox.payloadJson).mutationId, outbox.mutationId);
    assert.equal(changes.length, 1);
    assert.deepEqual(changes[0]?.scope.domains, ["payees"]);
  } finally {
    unsubscribe();
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});
