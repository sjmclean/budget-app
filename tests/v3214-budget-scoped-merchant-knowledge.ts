import assert from "node:assert/strict";
import {
  MERCHANT_KNOWLEDGE_STORAGE_KEY,
  createEmptyMerchantKnowledgeStore,
  readMerchantKnowledge,
  recordMerchantAliasEvidence,
  recordMerchantCategoryEvidence,
  suggestMerchantKnowledge,
  writeMerchantKnowledge,
} from "../apps/web/src/features/accounts/merchantKnowledge";
import {
  BUDGET_REGISTRY_STORAGE_KEY,
  createInitialBudgetRegistry,
} from "../apps/web/src/features/budget/budgetRegistry";
import {
  getBudgetScopedStorageKey,
  SELECTED_BUDGET_STORAGE_KEY,
} from "../apps/web/src/features/budget/budgetDataScope";
import { browserLocalStorageKeyValueStorage } from "../apps/web/src/features/persistence/keyValueStoragePort";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: storage },
});

const household = createInitialBudgetRegistry(
  new Date("2026-01-01T00:00:00.000Z"),
)[0];
const second = {
  ...household,
  id: "second",
  name: "Second Budget",
  packagePath: "~/Budgets/Second.budget",
};
storage.setItem(
  BUDGET_REGISTRY_STORAGE_KEY,
  JSON.stringify([household, second]),
);

storage.setItem(SELECTED_BUDGET_STORAGE_KEY, "household");
let householdStore = recordMerchantAliasEvidence({
  store: createEmptyMerchantKnowledgeStore(),
  sourceValue: "ALDI 1234",
  preferredName: "Aldi",
  observedAt: "2026-07-18T00:00:00.000Z",
});
householdStore = recordMerchantCategoryEvidence({
  store: householdStore,
  merchantName: "Aldi",
  categoryName: "Groceries",
  observedAt: "2026-07-18T00:00:00.000Z",
});
writeMerchantKnowledge(householdStore);

assert.equal(
  suggestMerchantKnowledge(readMerchantKnowledge(), "ALDI 9876")?.categoryName,
  "Groceries",
);
assert.ok(
  browserLocalStorageKeyValueStorage.getItem(
    getBudgetScopedStorageKey("household", MERCHANT_KNOWLEDGE_STORAGE_KEY),
  ),
);

storage.setItem(SELECTED_BUDGET_STORAGE_KEY, "second");
assert.deepEqual(readMerchantKnowledge(), createEmptyMerchantKnowledgeStore());
assert.equal(suggestMerchantKnowledge(readMerchantKnowledge(), "ALDI 9876"), undefined);

let secondStore = recordMerchantAliasEvidence({
  store: createEmptyMerchantKnowledgeStore(),
  sourceValue: "NETFLIX AU",
  preferredName: "Netflix",
  observedAt: "2026-07-18T00:00:00.000Z",
});
writeMerchantKnowledge(secondStore);
assert.equal(
  suggestMerchantKnowledge(readMerchantKnowledge(), "NETFLIX AU")?.preferredName,
  "Netflix",
);

storage.setItem(SELECTED_BUDGET_STORAGE_KEY, "household");
assert.equal(
  suggestMerchantKnowledge(readMerchantKnowledge(), "ALDI 9876")?.categoryName,
  "Groceries",
);
assert.equal(suggestMerchantKnowledge(readMerchantKnowledge(), "NETFLIX AU"), undefined);

// Legacy global Merchant Knowledge remains readable only for the starter
// household budget. The next write creates the budget-scoped value.
storage.removeItem(
  getBudgetScopedStorageKey("household", MERCHANT_KNOWLEDGE_STORAGE_KEY),
);
storage.setItem(
  MERCHANT_KNOWLEDGE_STORAGE_KEY,
  JSON.stringify(householdStore),
);
assert.equal(
  suggestMerchantKnowledge(readMerchantKnowledge(), "ALDI 9876")?.preferredName,
  "Aldi",
);
writeMerchantKnowledge(readMerchantKnowledge());
assert.ok(
  browserLocalStorageKeyValueStorage.getItem(
    getBudgetScopedStorageKey("household", MERCHANT_KNOWLEDGE_STORAGE_KEY),
  ),
);

storage.setItem(SELECTED_BUDGET_STORAGE_KEY, "second");
assert.equal(suggestMerchantKnowledge(readMerchantKnowledge(), "ALDI 9876"), undefined);

console.log("v3.21.4 budget-scoped Merchant Knowledge checks passed");
