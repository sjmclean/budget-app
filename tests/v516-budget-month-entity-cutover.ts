import assert from "node:assert/strict";
import { createBudgetViewService } from "../apps/web/src/features/budget/budgetViewService.js";
import { createBudgetMonthEntityRepository, readBudgetMonthEntity } from "../apps/web/src/features/budget/entities/budgetMonthEntity.js";
import type { KeyValueStoragePort } from "../apps/web/src/features/persistence/keyValueStoragePort.js";

const values = new Map<string, string>();
const storage: KeyValueStoragePort = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => void values.set(key, value),
  removeItem: (key) => void values.delete(key),
  listKeys: () => [...values.keys()],
};
const service = createBudgetViewService({
  storage,
  budgetActivity: {
    listRegisterTransactionsForBudgetActivity: async () => [],
    countCategoryReferences: async () => ({ registerTransactionCount: 0, registerSplitLineCount: 0, scheduledTransactionCount: 0 }),
    rewriteCategoryReferences: async () => undefined,
  },
});

const view = await service.getBudgetMonthView({ budgetId: "household", month: "2026-07" });
assert.equal(view.budgetId, "household");
assert.ok(readBudgetMonthEntity(storage, "household", "2026-07"));
assert.equal(storage.getItem("budget-app.budget-view.v1.household.2026-07"), null);
const entities = createBudgetMonthEntityRepository(storage).list();
assert.equal(entities.length, 1);
assert.equal(entities[0]?.metadata.id, "household:2026-07");
assert.ok(storage.getItem("budget-app.entity-replication.v1/budget-month-index"));
assert.ok(
  storage.getItem(
    `budget-app.entity-replication.v1/budget-month/${encodeURIComponent("household:2026-07")}`,
  ),
);

console.log("v5.16 budget month entity cutover validation passed");
