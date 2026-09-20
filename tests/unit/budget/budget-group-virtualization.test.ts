import assert from "node:assert/strict";
import test from "node:test";
import type { BudgetCategoryGroupView } from "../../../apps/web/src/features/budget/budgetViewTypes.js";
import {
  BUDGET_GROUP_VIRTUALIZATION_CATEGORY_THRESHOLD,
  buildBudgetVirtualGroupLayout,
  estimateBudgetGroupHeight,
  getVisibleBudgetGroupIndexes,
} from "../../../apps/web/src/features/budget/BudgetVirtualizedGroupList.js";

function group(index: number, categories = 20): BudgetCategoryGroupView {
  return {
    id: `group-${index}`,
    name: `Group ${index}`,
    previousAvailable: 0,
    assigned: 0,
    activity: 0,
    available: 0,
    note: "",
    categories: Array.from({ length: categories }, (_, categoryIndex) => ({
      id: `category-${index}-${categoryIndex}`,
      name: `Category ${index}-${categoryIndex}`,
      previousAvailable: 0,
      assigned: 0,
      activity: 0,
      available: 0,
      isOverspent: false,
      isArchived: false,
      note: "",
    })),
  };
}

test("large budget group layout keeps the mounted viewport bounded", () => {
  const groups = Array.from({ length: 100 }, (_, index) => group(index));
  assert.ok(
    groups.reduce((count, item) => count + item.categories.length, 0) >
      BUDGET_GROUP_VIRTUALIZATION_CATEGORY_THRESHOLD,
  );

  const layout = buildBudgetVirtualGroupLayout(
    groups,
    () => false,
    new Map(),
  );
  const visible = getVisibleBudgetGroupIndexes(layout, 10_000, 10_900, 800);

  assert.ok(visible.size < 10, `expected a bounded group window, got ${visible.size}`);
  assert.ok(visible.size > 0);
});

test("measured heights replace estimates without changing group order", () => {
  const groups = [group(0, 3), group(1, 3), group(2, 3)];
  const estimatedFirst = estimateBudgetGroupHeight(groups[0]!, false);
  const layout = buildBudgetVirtualGroupLayout(
    groups,
    () => false,
    new Map([[groups[0]!.id, estimatedFirst + 123]]),
  );

  assert.equal(layout[0]?.height, estimatedFirst + 123);
  assert.equal(layout[1]?.offsetTop, estimatedFirst + 123);
  assert.deepEqual(layout.map(({ id }) => id), groups.map(({ id }) => id));
});

test("collapsed groups estimate only their header footprint", () => {
  const item = group(0, 50);
  assert.equal(estimateBudgetGroupHeight(item, true), 48);
  assert.ok(estimateBudgetGroupHeight(item, false) > 48);
});
