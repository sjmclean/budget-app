import {
  BUDGET_REGISTRY_STORAGE_KEY,
  createBudgetRegistryEntry,
  deleteBudgetRegistryEntry,
  markBudgetOpened,
  readBudgetRegistry,
  updateBudgetRegistryEntry,
} from "../apps/web/src/features/budget/budgetRegistry";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort";

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
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const storage = new MemoryStorage();
const initial = readBudgetRegistry(storage);
assert(initial.length === 1, "empty registry should be seeded with one starter budget");
assert(initial[0]?.id === "household", "starter budget should have stable household id");
assert(storage.getItem(BUDGET_REGISTRY_STORAGE_KEY), "seeded registry should be persisted");

const second = createBudgetRegistryEntry(storage, {
  name: "Household Budget",
  currency: "nzd",
  now: new Date("2026-06-22T00:00:00.000Z"),
});
assert(second.id === "household-budget", "new budget should use a slugged id when base id is available");
assert(second.currency === "NZD", "new budget currency should be normalised to uppercase");

const third = createBudgetRegistryEntry(storage, {
  name: "Household Budget",
  currency: "AUD",
  now: new Date("2026-06-22T00:00:00.000Z"),
});
assert(third.id === "household-budget-2", "duplicate budget names should receive unique ids");

const opened = markBudgetOpened(storage, third.id, new Date("2026-06-22T01:00:00.000Z"));
assert(opened?.lastOpenedLabel === "Opened just now", "opened budget should update last-opened label");

const renamed = updateBudgetRegistryEntry(storage, third.id, {
  name: "Renamed Budget",
  currency: "usd",
  now: new Date("2026-06-22T02:00:00.000Z"),
});
assert(renamed?.name === "Renamed Budget", "budget registry update should rename budget");
assert(renamed?.currency === "USD", "budget registry update should update currency");

const remaining = deleteBudgetRegistryEntry(storage, third.id);
assert(!remaining.some((budget) => budget.id === third.id), "delete should remove the selected budget from registry");
assert(remaining.some((budget) => budget.id === "household"), "delete should preserve other budgets");

const afterDeletingAll = deleteBudgetRegistryEntry(storage, "household");
assert(afterDeletingAll.length === 1, "deleting household should leave the other created budget");
const empty = deleteBudgetRegistryEntry(storage, second.id);
assert(empty.length === 0, "registry should allow zero budgets after deleting the last budget");
assert(readBudgetRegistry(storage).length === 0, "stored empty registry should not be reseeded until storage is missing or corrupt");

console.log("v1.46 budget registry foundation validation passed");
