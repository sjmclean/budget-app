import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BUDGET_REGISTRY_STORAGE_KEY,
  createBudgetRegistryEntry,
  deleteBudgetRegistryEntry,
  markBudgetOpened,
  readBudgetRegistry,
  updateBudgetRegistryEntry,
} from "../../../apps/web/src/features/budget/budgetRegistry";
import {
  resolveActiveBudget,
  resolveActiveBudgetId,
} from "../../../apps/web/src/features/budget/activeBudget";
import type { KeyValueStoragePort } from "../../../apps/web/src/features/persistence/keyValueStoragePort";

function createMemoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    listKeys: () => [...values.keys()].sort(),
  };
}

describe("budget registry lifecycle", () => {
  it("seeds and persists the starter budget only when storage is absent", () => {
    const storage = createMemoryStorage();
    const initial = readBudgetRegistry(storage);
    assert.equal(initial.length, 1);
    assert.equal(initial[0]?.id, "household");
    assert.ok(storage.getItem(BUDGET_REGISTRY_STORAGE_KEY));

    deleteBudgetRegistryEntry(storage, "household");
    assert.deepEqual(readBudgetRegistry(storage), []);
  });

  it("creates opaque unique identities independently of duplicate names", () => {
    const storage = createMemoryStorage();
    const first = createBudgetRegistryEntry(storage, { name: "Holiday", currency: "nzd" });
    const second = createBudgetRegistryEntry(storage, { name: "Holiday" });

    assert.match(first.id, /^budget-[a-z0-9-]+$/i);
    assert.match(second.id, /^budget-[a-z0-9-]+$/i);
    assert.notEqual(first.id, second.id);
    assert.equal(first.currency, "NZD");
    assert.equal(first.name, second.name);
  });

  it("updates, opens, and deletes only the addressed identity", () => {
    const storage = createMemoryStorage();
    const budget = createBudgetRegistryEntry(storage, { name: "Business" });
    const untouched = createBudgetRegistryEntry(storage, { name: "Personal" });
    const updated = updateBudgetRegistryEntry(storage, budget.id, {
      name: "Renamed Business",
      currency: "usd",
      now: new Date("2026-07-20T00:00:00.000Z"),
    });
    assert.equal(updated?.name, "Renamed Business");
    assert.equal(updated?.currency, "USD");
    assert.equal(markBudgetOpened(storage, budget.id)?.lastOpenedLabel, "Opened just now");
    assert.deepEqual(deleteBudgetRegistryEntry(storage, budget.id).map(({ id }) => id), [
      "household",
      untouched.id,
    ]);
  });

  it("never silently selects a replacement budget", () => {
    const storage = createMemoryStorage();
    const selected = createBudgetRegistryEntry(storage, { name: "Selected" });
    const budgets = readBudgetRegistry(storage);

    assert.equal(resolveActiveBudgetId(budgets, selected.id), selected.id);
    assert.equal(resolveActiveBudget(budgets, selected.id)?.id, selected.id);
    assert.equal(resolveActiveBudgetId(budgets, null), null);
    assert.equal(resolveActiveBudgetId(budgets, "missing"), null);
    assert.equal(resolveActiveBudget(budgets, "missing"), null);
  });
});
