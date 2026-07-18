import assert from "node:assert/strict";
import {
  BUDGET_REGISTRY_STORAGE_KEY,
  createBudgetRegistryEntry,
  readBudgetRegistry,
  writeBudgetRegistry,
} from "../apps/web/src/features/budget/budgetRegistry";
import {
  collectBudgetScopedStorageKeys,
  deleteBudgetById,
} from "../apps/web/src/features/budget/budgetLifecycle";
import { getBudgetScopedStorageKey } from "../apps/web/src/features/budget/budgetDataScope";
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

  listKeys(): string[] {
    return [...this.values.keys()];
  }
}

const storage = new MemoryStorage();
writeBudgetRegistry(storage, []);

const first = createBudgetRegistryEntry(storage, { name: "Imported Household" });
const second = createBudgetRegistryEntry(storage, { name: "Imported Household" });
assert.notEqual(first.id, second.id, "Budgets with the same name must receive different immutable IDs.");
assert.match(first.id, /^budget-[0-9a-f-]{36}$/i);
assert.match(second.id, /^budget-[0-9a-f-]{36}$/i);

const accountId = "everyday-account";
const namespaceKey = getBudgetScopedStorageKey(first.id, "budget-app.imported-file-fingerprints.v1");
storage.setItem(
  getBudgetScopedStorageKey(first.id, "budget-app.accounts.v1"),
  JSON.stringify([{ id: accountId, name: "Everyday" }]),
);
storage.setItem(namespaceKey, JSON.stringify(["qif-fingerprint"]));
storage.setItem(
  getBudgetScopedStorageKey(first.id, "budget-app.merchant-knowledge.v1"),
  JSON.stringify({ aliases: [] }),
);
storage.setItem(
  getBudgetScopedStorageKey(first.id, "budget-app.transaction-import-diagnostics.v1"),
  JSON.stringify([{ id: "diagnostic" }]),
);
storage.setItem(
  getBudgetScopedStorageKey(first.id, "budget-app.version-history.v1.snapshot.test"),
  JSON.stringify({ id: "snapshot" }),
);
storage.setItem(`budget-app.budget-view.v1.${first.id}.2026-07`, "{}");
storage.setItem(`budget-app.ynab4-launcher-import.v1.${first.id}`, "{}");
storage.setItem(`budget-app.actual-budget-launcher-import.v1.${first.id}`, "{}");
storage.setItem(`budget-app.budget-collapsed-groups.v1.${first.id}`, "[]");
storage.setItem(`budget-app.budget-archived-categories-expanded.v1.${first.id}`, "true");
storage.setItem(`budget-app.budget-table-layout.v1.${first.id}`, "[]");
storage.setItem(`budget-app.budget-table-layout.v1.${first.id}.widths`, "{}");
storage.setItem(`budget-app.register-sort.v1.${accountId}`, "{}");
storage.setItem(`budget-app.register-columns.v1.${accountId}`, "[]");
storage.setItem(`budget-app.register-columns.v1.${accountId}.widths`, "{}");
storage.setItem("budget-app.unrelated-setting.v1", "keep");

const collected = collectBudgetScopedStorageKeys(storage, first.id);
assert.ok(collected.includes(namespaceKey));
assert.ok(collected.includes(`budget-app.register-sort.v1.${accountId}`));

const result = deleteBudgetById(storage, first.id);
assert.equal(result.completed, true);
assert.equal(readBudgetRegistry(storage).some((budget) => budget.id === first.id), false);
assert.equal(readBudgetRegistry(storage).some((budget) => budget.id === second.id), true);
assert.equal(storage.getItem("budget-app.unrelated-setting.v1"), "keep");

for (const key of storage.listKeys()) {
  assert.equal(
    key.includes(first.id),
    false,
    `Deleted budget residue remained under storage key ${key}`,
  );
  assert.equal(
    key.endsWith(`.${accountId}`) || key.endsWith(`.${accountId}.widths`),
    false,
    `Deleted account UI residue remained under storage key ${key}`,
  );
}

const recreated = createBudgetRegistryEntry(storage, { name: "Imported Household" });
assert.notEqual(recreated.id, first.id, "Recreating a deleted budget must not reuse its identity.");
assert.notEqual(recreated.id, second.id);
assert.equal(
  storage.getItem(getBudgetScopedStorageKey(recreated.id, "budget-app.imported-file-fingerprints.v1")),
  null,
  "A recreated budget must start without stale importer history.",
);

assert.ok(storage.getItem(BUDGET_REGISTRY_STORAGE_KEY));
console.log("v3.23.0 budget identity and complete deletion tests passed");
