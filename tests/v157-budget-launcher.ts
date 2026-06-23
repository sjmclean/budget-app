import assert from "node:assert/strict";
import {
  BUDGET_REGISTRY_STORAGE_KEY,
  createBudgetRegistryEntry,
  deleteBudgetRegistryEntry,
  markBudgetOpened,
  readBudgetRegistry,
} from "../apps/web/src/features/budget/budgetRegistry";
import { resolveActiveBudgetId } from "../apps/web/src/features/budget/activeBudget";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort";

function createMemoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
    listKeys() {
      return [...values.keys()].sort();
    },
  };
}

function testInitialRegistryCreatesStarterBudget() {
  const storage = createMemoryStorage();
  const budgets = readBudgetRegistry(storage);

  assert.equal(budgets.length, 1);
  assert.equal(budgets[0].name, "Household Budget");
  assert.equal(storage.getItem(BUDGET_REGISTRY_STORAGE_KEY) !== null, true);
}

function testCreateBudgetFromScratchDefaultsCurrency() {
  const storage = createMemoryStorage();
  const budget = createBudgetRegistryEntry(storage, {
    name: "Scratch Budget",
    now: new Date("2026-06-23T10:00:00.000Z"),
  });

  assert.equal(budget.name, "Scratch Budget");
  assert.equal(budget.currency, "AUD");
  assert.equal(budget.id, "scratch-budget");

  const budgets = readBudgetRegistry(storage);
  assert.equal(budgets.some((entry) => entry.id === "scratch-budget"), true);
}

function testDuplicateBudgetNamesGetUniqueIds() {
  const storage = createMemoryStorage();

  const first = createBudgetRegistryEntry(storage, { name: "Holiday" });
  const second = createBudgetRegistryEntry(storage, { name: "Holiday" });

  assert.equal(first.id, "holiday");
  assert.equal(second.id, "holiday-2");
}

function testOpenBudgetUpdatesLastOpened() {
  const storage = createMemoryStorage();
  const budget = createBudgetRegistryEntry(storage, { name: "Business" });

  const opened = markBudgetOpened(storage, budget.id, new Date("2026-06-23T10:05:00.000Z"));

  assert.equal(opened?.lastOpenedLabel, "Opened just now");
}

function testActiveBudgetResolutionDoesNotAutoSelectAfterDelete() {
  const storage = createMemoryStorage();
  const first = createBudgetRegistryEntry(storage, { name: "One" });
  const second = createBudgetRegistryEntry(storage, { name: "Two" });

  const remaining = deleteBudgetRegistryEntry(storage, first.id);

  assert.equal(resolveActiveBudgetId(remaining, first.id), null);
  assert.equal(resolveActiveBudgetId(remaining, null), null);
  assert.equal(resolveActiveBudgetId(remaining, second.id), second.id);
}

function run() {
  testInitialRegistryCreatesStarterBudget();
  testCreateBudgetFromScratchDefaultsCurrency();
  testDuplicateBudgetNamesGetUniqueIds();
  testOpenBudgetUpdatesLastOpened();
  testActiveBudgetResolutionDoesNotAutoSelectAfterDelete();
  console.log("v1.57 budget launcher tests passed");
}

run();
