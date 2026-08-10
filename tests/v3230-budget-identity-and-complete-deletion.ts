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
import { createFixedBudgetScopedStorage, getBudgetScopedStorageKey } from "../apps/web/src/features/budget/budgetDataScope";
import { replaceAccountEntities } from "../apps/web/src/features/accounts/entities/accountEntity.js";
import {
  IMPORTED_FILE_FINGERPRINT_ENTITY_RECORD_PREFIX,
  upsertImportedFileFingerprintEntity,
} from "../apps/web/src/features/accounts/entities/importFingerprintEntity.js";
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
const firstBudgetStorage = createFixedBudgetScopedStorage(storage, first.id);
replaceAccountEntities(firstBudgetStorage, [{
  id: accountId,
  name: "Everyday",
  type: "on-budget",
  startingBalance: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
  closedAt: null,
}]);
upsertImportedFileFingerprintEntity(firstBudgetStorage, {
  accountId,
  fileHash: "qif-fingerprint",
  fileName: "statement.qif",
  importedAt: "2026-07-01T00:00:00.000Z",
  transactionCount: 1,
});
const namespaceKey = storage.listKeys().find((key) =>
  key.startsWith(getBudgetScopedStorageKey(first.id, IMPORTED_FILE_FINGERPRINT_ENTITY_RECORD_PREFIX))
);
assert.ok(namespaceKey);
storage.setItem(
  getBudgetScopedStorageKey(first.id, "budget-app.entity-replication.v1/merchant-knowledge-index"),
  JSON.stringify([]),
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
assert.ok(collected.includes(namespaceKey!));
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
  storage.listKeys().some((key) =>
    key.startsWith(getBudgetScopedStorageKey(recreated.id, IMPORTED_FILE_FINGERPRINT_ENTITY_RECORD_PREFIX)),
  ),
  false,
  "A recreated budget must start without stale importer history.",
);

assert.ok(storage.getItem(BUDGET_REGISTRY_STORAGE_KEY));
console.log("v3.23.0 budget identity and complete deletion tests passed");
