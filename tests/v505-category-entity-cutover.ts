import assert from "node:assert/strict";
import {
  applyCategoryEntities,
  CATEGORY_ENTITY_INDEX_KEY,
  CATEGORY_GROUP_ENTITY_INDEX_KEY,
  createCategoryEntityRepository,
  syncCategoryEntities,
} from "../apps/web/src/features/budget/categoryEntities.js";
import type { BudgetMonthView } from "../apps/web/src/features/budget/budgetViewTypes.js";

const values = new Map<string, string>();
const storage = {
  getItem(key: string) { return values.get(key) ?? null; },
  setItem(key: string, value: string) { values.set(key, value); },
  removeItem(key: string) { values.delete(key); },
  listKeys() { return [...values.keys()]; },
};
const view: BudgetMonthView = {
  budgetId: "household", budgetName: "Household", monthLabel: "July 2026", currencyCode: "AUD",
  readyToAssign: 0, totalAssigned: 100, totalActivity: -25, totalAvailable: 75,
  categoryGroups: [{ id: "living", name: "Living", note: "group note", previousAvailable: 0, assigned: 100, activity: -25, available: 75,
    categories: [{ id: "groceries", name: "Groceries", sourceCategoryId: "source-1", previousAvailable: 0, assigned: 100, activity: -25, available: 75, isOverspent: false, isArchived: false, overspendingHandling: "reduce-next-month", note: "category note" }] }],
};
syncCategoryEntities(storage, view, new Date("2026-07-26T00:00:00Z"));
assert.deepEqual(JSON.parse(storage.getItem(CATEGORY_GROUP_ENTITY_INDEX_KEY)!), ["living"]);
assert.deepEqual(JSON.parse(storage.getItem(CATEGORY_ENTITY_INDEX_KEY)!), ["groceries"]);
const entity = createCategoryEntityRepository(storage).get("groceries");
assert.equal(entity?.fields.name.value, "Groceries");
assert.equal(entity?.fields.groupId.value, "living");
const renamed: BudgetMonthView = { ...view, categoryGroups: [{ ...view.categoryGroups[0]!, name: "Essentials", categories: [{ ...view.categoryGroups[0]!.categories[0]!, name: "Food", isArchived: true }] }] };
syncCategoryEntities(storage, renamed, new Date("2026-07-26T00:00:01Z"));
const staleProjection: BudgetMonthView = JSON.parse(JSON.stringify(view));
const projected = applyCategoryEntities(storage, staleProjection);
assert.equal(projected.categoryGroups[0]?.name, "Essentials");
assert.equal(projected.categoryGroups[0]?.categories[0]?.name, "Food");
assert.equal(projected.categoryGroups[0]?.categories[0]?.isArchived, true);
assert.equal(projected.categoryGroups[0]?.categories[0]?.assigned, 100);
const deleted: BudgetMonthView = { ...renamed, categoryGroups: [{ ...renamed.categoryGroups[0]!, categories: [] }] };
syncCategoryEntities(storage, deleted, new Date("2026-07-26T00:00:02Z"));
assert.equal(createCategoryEntityRepository(storage).list().length, 0);
assert.equal(createCategoryEntityRepository(storage).list({ includeTombstoned: true }).length, 1);
console.log("PASS: Category structure persists as replicated entities while monthly amounts remain projection data");
