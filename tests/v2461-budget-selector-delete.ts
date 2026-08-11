import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  deleteBudgetById,
  deleteCurrentBudget,
} from "../apps/web/src/features/budget/budgetLifecycle.js";
import {
  createBudgetRegistryEntry,
  createInitialBudgetRegistry,
  readBudgetRegistry,
  writeBudgetRegistry,
} from "../apps/web/src/features/budget/budgetRegistry.js";
import {
  getBudgetScopedStorageKey,
  SELECTED_BUDGET_STORAGE_KEY,
} from "../apps/web/src/features/budget/budgetDataScope.js";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.js";

class MemoryStorage implements KeyValueStoragePort {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  listKeys(): string[] {
    return [...this.values.keys()].sort();
  }
}

const storage = new MemoryStorage();
writeBudgetRegistry(storage, createInitialBudgetRegistry());
const household = readBudgetRegistry(storage)[0]!;
const travel = createBudgetRegistryEntry(storage, {
  name: "Travel Budget",
  currency: "AUD",
  now: new Date("2026-07-02T00:00:00.000Z"),
});

storage.setItem(SELECTED_BUDGET_STORAGE_KEY, household.id);
storage.setItem(getBudgetScopedStorageKey(household.id, "budget-app.accounts.v1"), JSON.stringify([{ id: "everyday" }]));
storage.setItem(getBudgetScopedStorageKey(travel.id, "budget-app.accounts.v1"), JSON.stringify([{ id: "travel-card" }]));
storage.setItem(`budget-app.budget-view.v1.${household.id}.2026-07`, JSON.stringify({ household: true }));
storage.setItem(`budget-app.budget-view.v1.${travel.id}.2026-07`, JSON.stringify({ travel: true }));

const deleteInactive = deleteBudgetById(storage, travel.id);
assert.equal(deleteInactive.completed, true, "inactive budget delete should complete");
assert.equal(deleteInactive.budgetId, travel.id);
assert.equal(storage.getItem(SELECTED_BUDGET_STORAGE_KEY), household.id, "deleting inactive budget should not clear selected budget");
assert.deepEqual(readBudgetRegistry(storage).map((budget) => budget.id), [household.id]);
assert.equal(storage.getItem(getBudgetScopedStorageKey(travel.id, "budget-app.accounts.v1")), null, "deleted budget scoped data should be removed");
assert.equal(storage.getItem(`budget-app.budget-view.v1.${travel.id}.2026-07`), null, "deleted budget view months should be removed");
assert.ok(storage.getItem(getBudgetScopedStorageKey(household.id, "budget-app.accounts.v1")), "other budget scoped data should remain");

const deleteActiveLastBudget = deleteCurrentBudget(storage);
assert.equal(deleteActiveLastBudget.completed, true, "active last budget delete should complete");
assert.equal(deleteActiveLastBudget.budgetId, household.id);
assert.equal(deleteActiveLastBudget.remainingBudgets, 0, "last budget delete should be allowed");
assert.equal(storage.getItem(SELECTED_BUDGET_STORAGE_KEY), null, "deleting selected budget should clear selected budget");
assert.deepEqual(readBudgetRegistry(storage), [], "registry should be empty after deleting the last budget");
assert.ok(deleteActiveLastBudget.warnings.some((warning) => warning.includes("No budgets remain")));

const missingBudget = deleteBudgetById(storage, "missing-budget");
assert.equal(missingBudget.completed, true, "missing budget delete should satisfy the idempotent deletion postcondition");
assert.equal(missingBudget.budgetId, "missing-budget");
assert.deepEqual(missingBudget.errors, []);
assert.ok(missingBudget.warnings.some((warning) => warning.includes("already absent")));

const selectorPage = readFileSync(
  join(process.cwd(), "apps/web/src/pages/BudgetSelectorPage.tsx"),
  "utf8",
);
const budgetRegistryStore = readFileSync(
  join(process.cwd(), "apps/web/src/stores/budgetRegistryStore.ts"),
  "utf8",
);
const budgetLifecycle = readFileSync(
  join(process.cwd(), "apps/web/src/features/budget/budgetLifecycle.ts"),
  "utf8",
);

assert.match(budgetLifecycle, /export function deleteBudgetById/);
assert.match(budgetRegistryStore, /deleteBudgetById/);
assert.match(selectorPage, /handleRequestDeleteBudget/);
assert.doesNotMatch(
  selectorPage,
  /Type \{budgetPendingDelete\.name\} to confirm/,
);
assert.match(selectorPage, /Delete Budget/);
assert.match(selectorPage, /This action cannot be undone/);
assert.match(selectorPage, /clearSelectedBudget\(\)/);
assert.doesNotMatch(selectorPage, /This is your last budget/);

console.log("v2.46.1 budget selector delete checks passed");
