import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BUDGET_REGISTRY_STORAGE_KEY,
  createBudgetRegistryEntry,
  readBudgetRegistry,
} from "../apps/web/src/features/budget/budgetRegistry.js";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.js";

function createMemoryStorage(): KeyValueStoragePort {
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: key => void values.delete(key),
    listKeys: () => [...values.keys()].sort(),
  };
}

const emptyStorage = createMemoryStorage();
assert.deepEqual(
  readBudgetRegistry(emptyStorage),
  [],
  "a missing registry must represent a genuine no-budgets first-run state",
);
assert.equal(
  emptyStorage.getItem(BUDGET_REGISTRY_STORAGE_KEY),
  null,
  "reading an empty registry must not create Household Budget or write storage",
);

const corruptStorage = createMemoryStorage();
corruptStorage.setItem(BUDGET_REGISTRY_STORAGE_KEY, "{not-json");
assert.deepEqual(
  readBudgetRegistry(corruptStorage),
  [],
  "corrupt registry data must not trigger automatic budget creation",
);
assert.equal(
  corruptStorage.getItem(BUDGET_REGISTRY_STORAGE_KEY),
  "{not-json",
  "a read operation must not overwrite corrupt data before recovery is explicit",
);

const created = createBudgetRegistryEntry(emptyStorage, {
  name: "My First Budget",
  now: new Date("2026-07-23T02:00:00.000Z"),
});
assert.deepEqual(
  readBudgetRegistry(emptyStorage).map(budget => budget.id),
  [created.id],
  "the first registry entry must be created only by an explicit create action",
);
assert.equal(
  readBudgetRegistry(emptyStorage)[0]?.name,
  "My First Budget",
  "explicit creation must preserve the user's chosen name",
);
assert.notEqual(
  created.id,
  "household",
  "the first explicit budget must use a normal opaque identity rather than a bootstrap identity",
);

const selectorSource = readFileSync(
  "apps/web/src/pages/BudgetSelectorPage.tsx",
  "utf8",
);
assert.match(selectorSource, /No budgets yet/);
assert.match(selectorSource, /\+ New Budget/);
assert.match(selectorSource, /Migrate Budget/);

console.log("v1.57 empty registry bootstrap checks passed");
