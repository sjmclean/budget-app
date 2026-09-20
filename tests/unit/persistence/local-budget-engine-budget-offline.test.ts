import assert from "node:assert/strict";
import Database from "better-sqlite3";
import test from "node:test";

import type { BudgetMonthView } from "../../../apps/web/src/features/budget/budgetViewTypes.js";
import { flushPersistenceChanges, subscribePersistenceChanges } from "../../../apps/web/src/features/persistence/persistenceChangeBus.js";
import type { LocalBudgetMutation } from "../../../apps/web/src/features/persistence/localFirst/contracts.js";
import { createLocalBudgetRuntime } from "../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.js";
import type { LocalBudgetDatabaseClient } from "../../../apps/web/src/features/persistence/localFirst/localBudgetClient.js";

test("LocalBudgetEngine commits an assignment and outbox row while the relay is unavailable", async () => {
  const budgetId = "offline-budget";
  const month = "2026-09";
  const syncEpoch = "offline-epoch";
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE budget_months (month TEXT PRIMARY KEY, view_json TEXT NOT NULL);
    CREATE TABLE outbox (mutation_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL);
  `);
  const initial: BudgetMonthView = {
    budgetId, budgetName: "Offline", monthLabel: "September", currencyCode: "AUD",
    readyToAssign: 500, totalAssigned: 0, totalActivity: 0, totalAvailable: 0,
    categoryGroups: [{
      id: "group-a", name: "Bills", previousAvailable: 0, assigned: 0,
      activity: 0, available: 0, note: "", categories: [{
        id: "category-a", name: "Rent", previousAvailable: 0, assigned: 0,
        activity: 0, available: 0, isOverspent: false, isArchived: false, note: "",
      }],
    }],
  };
  sqlite.prepare("INSERT INTO budget_months VALUES (?, ?)").run(month, JSON.stringify(initial));

  const database = {
    async open() { return {}; },
    async close() {},
    async getSyncState() { return { budgetId, syncEpoch, baselineHash: "local", pulledCursor: 0 }; },
    async readEntity<T>(_domain: string, entityId: string) {
      const row = sqlite.prepare("SELECT view_json FROM budget_months WHERE month = ?")
        .get(entityId) as { view_json: string } | undefined;
      return (row ? JSON.parse(row.view_json) : null) as T | null;
    },
    async mutateBatch(mutations: readonly LocalBudgetMutation[]) {
      sqlite.transaction(() => {
        for (const mutation of mutations) {
          sqlite.prepare("INSERT INTO outbox VALUES (?, ?)")
            .run(mutation.mutationId, JSON.stringify(mutation));
          const payload = mutation.payload as { kind?: string; month?: string; categoryId?: string; assigned?: number };
          if (payload.kind !== "category-assignment") continue;
          const row = sqlite.prepare("SELECT view_json FROM budget_months WHERE month = ?")
            .get(payload.month) as { view_json: string };
          const view = JSON.parse(row.view_json) as BudgetMonthView;
          const next = {
            ...view,
            totalAssigned: payload.assigned!,
            categoryGroups: view.categoryGroups.map((group) => ({
              ...group,
              assigned: group.categories.some(({ id }) => id === payload.categoryId) ? payload.assigned! : group.assigned,
              categories: group.categories.map((category) => category.id === payload.categoryId
                ? { ...category, assigned: payload.assigned!, available: payload.assigned! }
                : category),
            })),
          };
          sqlite.prepare("UPDATE budget_months SET view_json = ? WHERE month = ?")
            .run(JSON.stringify(next), payload.month);
        }
      })();
      return {};
    },
  } as unknown as LocalBudgetDatabaseClient;
  const storage = new Map<string, string>([
    ["budget-app.local-first.device-id", "offline-device"],
    [`budget-app.local-first.sync-epoch.${budgetId}`, syncEpoch],
    [`budget-app.local-first.database-file.${budgetId}`, `/budget-physical-${budgetId}-fixture.sqlite3`],
  ]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("relay unavailable"); };
  let publications = 0;
  const unsubscribe = subscribePersistenceChanges(() => { publications += 1; });
  try {
    const engine = createLocalBudgetRuntime({} as Parameters<typeof createLocalBudgetRuntime>[0], {
      databaseFactory: () => database,
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => { storage.set(key, value); },
      },
      tabSyncCoordinator: {
        async run<T>(_id: string, operation: () => Promise<T>) { return operation(); },
        close() {},
      },
    });
    const result = await engine.setCategoryAssignedValues({
      budgetId, month, assignments: [{ categoryId: "category-a", assigned: 250 }],
    });
    flushPersistenceChanges();
    assert.equal(result.categoryGroups[0]!.categories[0]!.assigned, 250);
    const persisted = JSON.parse((sqlite.prepare("SELECT view_json FROM budget_months WHERE month = ?")
      .get(month) as { view_json: string }).view_json) as BudgetMonthView;
    assert.equal(persisted.categoryGroups[0]!.categories[0]!.assigned, 250);
    assert.equal((sqlite.prepare("SELECT COUNT(*) AS count FROM outbox").get() as { count: number }).count, 1);
    assert.equal(publications, 1);
  } finally {
    unsubscribe();
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});
