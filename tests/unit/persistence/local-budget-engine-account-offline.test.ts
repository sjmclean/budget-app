import assert from "node:assert/strict";
import Database from "better-sqlite3";
import test from "node:test";

import { flushPersistenceChanges, subscribePersistenceChanges } from "../../../apps/web/src/features/persistence/persistenceChangeBus.js";
import type { LocalBudgetMutation } from "../../../apps/web/src/features/persistence/localFirst/contracts.js";
import { createLocalBudgetRuntime } from "../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.js";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";
import type { LocalAccountRecord } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";

test("LocalBudgetEngine creates and updates an account locally while the relay is unavailable", async () => {
  const budgetId = "offline-budget";
  const syncEpoch = "offline-epoch";
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, budget_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
      participation TEXT NOT NULL, opening_balance INTEGER NOT NULL, currency_code TEXT NOT NULL,
      created_at TEXT NOT NULL, closed_at TEXT
    );
    CREATE TABLE outbox (mutation_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL);
  `);
  const database = {
    async open() { return {}; },
    async close() {},
    async getSyncState() {
      return { budgetId, syncEpoch, baselineHash: "local-baseline", pulledCursor: 0 };
    },
    async listAccountNavigation(id: string) {
      return sqlite.prepare(`
        SELECT id, name, type, participation, opening_balance AS openingBalance,
          currency_code AS currencyCode, closed_at AS closedAt,
          opening_balance AS workingBalance, 0 AS transactionCount,
          0 AS hasUncategorizedTransactions
        FROM accounts WHERE budget_id = ? ORDER BY id
      `).all(id);
    },
    async writeAccount(account: LocalAccountRecord, mutation: LocalBudgetMutation) {
      sqlite.transaction(() => {
        sqlite.prepare(`
          INSERT INTO accounts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type,
            participation=excluded.participation, opening_balance=excluded.opening_balance,
            currency_code=excluded.currency_code, closed_at=excluded.closed_at
        `).run(account.id, account.budgetId, account.name, account.type, account.participation,
          account.openingBalance, account.currencyCode, account.createdAt, account.closedAt);
        sqlite.prepare("INSERT INTO outbox VALUES (?, ?)").run(mutation.mutationId, JSON.stringify(mutation));
      })();
      return {};
    },
  } as unknown as LocalBudgetDatabaseClient;
  const values = new Map<string, string>([
    ["budget-app.local-first.device-id", "offline-device"],
    [`budget-app.local-first.sync-epoch.${budgetId}`, syncEpoch],
    [`budget-app.local-first.database-file.${budgetId}`, "/budget-physical-offline-budget-fixture.sqlite3"],
  ]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("relay unavailable"); };
  let publications = 0;
  const unsubscribe = subscribePersistenceChanges(() => { publications += 1; });
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

    const created = await engine.createAccount(budgetId, {
      id: "account-a", name: "Offline account", type: "checking", startingBalance: 12.34,
    });
    flushPersistenceChanges();
    assert.equal(created.some(({ id }) => id === "account-a"), true);
    assert.deepEqual(
      sqlite.prepare("SELECT name, opening_balance FROM accounts WHERE id = ?").get("account-a"),
      { name: "Offline account", opening_balance: 1234 },
    );
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM outbox").get() as { count: number }).count, 1);
    assert.equal(publications, 1);

    await engine.updateAccount(budgetId, {
      id: "account-a", name: "Offline account renamed", type: "checking",
    });
    flushPersistenceChanges();
    assert.equal((sqlite.prepare("SELECT name FROM accounts WHERE id = ?").get("account-a") as { name: string }).name, "Offline account renamed");
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM outbox").get() as { count: number }).count, 2);
    assert.equal(publications, 2);
  } finally {
    unsubscribe();
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});
