import assert from "node:assert/strict";
import { installInMemoryBudgetPersistence } from "./support/persistence/inMemoryBudgetPersistence.js";
import {
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
import {
  MERCHANT_KNOWLEDGE_ENTITY_INDEX_KEY,
} from "../apps/web/src/features/accounts/entities/importKnowledgeEntity";

const { storage, cleanup } = installInMemoryBudgetPersistence();

try {
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
  storage.getItem(
    getBudgetScopedStorageKey("household", MERCHANT_KNOWLEDGE_ENTITY_INDEX_KEY),
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

storage.setItem(SELECTED_BUDGET_STORAGE_KEY, "second");
assert.equal(suggestMerchantKnowledge(readMerchantKnowledge(), "ALDI 9876"), undefined);

console.log("v3.21.4 budget-scoped Merchant Knowledge checks passed");
} finally {
  cleanup();
}
