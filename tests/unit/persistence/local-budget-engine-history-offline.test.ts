import assert from "node:assert/strict";
import Database from "better-sqlite3";
import test from "node:test";
import { flushPersistenceChanges, subscribePersistenceChanges } from "../../../apps/web/src/features/persistence/persistenceChangeBus.js";
import type { LocalBudgetMutation } from "../../../apps/web/src/features/persistence/localFirst/contracts.js";
import { createLocalBudgetRuntime } from "../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.js";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";
import type { TransactionHistorySnapshot } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";

test("public engine restores transaction history locally while relay is unavailable", async () => {
  const budgetId = "offline-history"; const syncEpoch = "epoch"; const sqlite = new Database(":memory:");
  sqlite.exec("CREATE TABLE transactions(id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE outbox(mutation_id TEXT PRIMARY KEY, payload TEXT NOT NULL)");
  const database = { async open() { return {}; }, async close() {},
    async getSyncState() { return { budgetId, syncEpoch, baselineHash: "local", pulledCursor: 0 }; },
    async restoreTransactionHistorySnapshot(snapshot: TransactionHistorySnapshot, mutations: readonly LocalBudgetMutation[]) {
      sqlite.transaction(() => { for (const transaction of snapshot.transactions) sqlite.prepare("INSERT INTO transactions VALUES (?, ?)").run(transaction.id, JSON.stringify(transaction));
        for (const mutation of mutations) sqlite.prepare("INSERT INTO outbox VALUES (?, ?)").run(mutation.mutationId, JSON.stringify(mutation)); })(); return {};
    } } as unknown as LocalBudgetDatabaseClient;
  const values = new Map([["budget-app.local-first.device-id", "device"], [`budget-app.local-first.sync-epoch.${budgetId}`, syncEpoch]]);
  const originalFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error("relay unavailable"); };
  const events: string[][] = []; const unsubscribe = subscribePersistenceChanges((event) => events.push([...event.scope.domains]));
  try {
    const engine = createLocalBudgetRuntime({} as Parameters<typeof createLocalBudgetRuntime>[0], { databaseFactory: () => database,
      storage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } },
      tabSyncCoordinator: { async run<T>(_id: string, operation: () => Promise<T>) { return operation(); }, close() {} } });
    await engine.restoreTransactionHistorySnapshot({ budgetId, transactions: [{ id: "transaction", budgetId, accountId: "account",
      date: "2026-09-17", amount: -100, memo: null, checkNumber: null, clearedStatus: "uncleared", payeeId: null,
      payeeName: null, categoryId: null, categoryName: null, transferAccountId: null, transferTransactionId: null,
      generatedFromSchedule: false, scheduledTransactionId: null, scheduledOccurrenceDate: null, splitLines: [], tagIds: [],
      importProvenance: [], updatedAt: "now" }], attachments: [] });
    flushPersistenceChanges();
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM transactions").get() as { count: number }).count, 1);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM outbox").get() as { count: number }).count, 1);
    assert.deepEqual(events, [["budget", "transactions"]]);
  } finally { unsubscribe(); globalThis.fetch = originalFetch; sqlite.close(); }
});
