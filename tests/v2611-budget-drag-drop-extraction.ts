import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBudgetDragMove } from "../apps/web/src/features/budget/useBudgetDragDrop";
import {
  getCategorySortableId,
  getGroupSortableId,
} from "../apps/web/src/features/budget/BudgetWorkspaceGroup";
import type {
  BudgetCategoryGroupView,
  BudgetCategoryView,
} from "../apps/web/src/features/budget/budgetViewTypes";

function category(overrides: Partial<BudgetCategoryView> = {}): BudgetCategoryView {
  return {
    id: "mortgage",
    name: "Mortgage",
    assigned: 0,
    activity: 0,
    available: 0,
    note: "",
    isArchived: false,
    ...overrides,
  };
}

function group(
  id: string,
  categories: BudgetCategoryView[],
  name = id,
): BudgetCategoryGroupView {
  return {
    id,
    name,
    note: "",
    categories,
  };
}

const visibleCategoryGroups = [
  group("bills", [
    category({ id: "rent", name: "Rent" }),
    category({ id: "mortgage", name: "Mortgage" }),
  ]),
  group("everyday", [category({ id: "groceries", name: "Groceries" })]),
];

function testExtractionBoundary() {
  const budgetPageSource = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");
  const dragDropSource = readFileSync(
    "apps/web/src/features/budget/useBudgetDragDrop.ts",
    "utf8",
  );

  assert.match(
    budgetPageSource,
    /from "\.\.\/features\/budget\/useBudgetDragDrop"/,
    "BudgetPage should use the extracted budget drag/drop hook",
  );
  assert.doesNotMatch(
    budgetPageSource,
    /function handleBudgetDragEnd/,
    "BudgetPage should no longer own the drag-end implementation",
  );
  assert.match(
    dragDropSource,
    /buildBudgetDragMove/,
    "The extracted module should expose testable drag/drop move selection",
  );
}

function testCategoryMoveWithinSameGroupAfterTarget() {
  const move = buildBudgetDragMove({
    activeId: getCategorySortableId("rent"),
    overId: getCategorySortableId("mortgage"),
    visibleCategoryGroups,
  });

  assert.deepEqual(move, {
    type: "category",
    activeCategoryId: "rent",
    targetCategoryId: "mortgage",
    placement: "after",
  });
}

function testCategoryMoveAcrossGroupsBeforeTarget() {
  const move = buildBudgetDragMove({
    activeId: getCategorySortableId("groceries"),
    overId: getCategorySortableId("rent"),
    visibleCategoryGroups,
  });

  assert.deepEqual(move, {
    type: "category",
    activeCategoryId: "groceries",
    targetCategoryId: "rent",
    placement: "before",
  });
}

function testGroupMoveAfterTarget() {
  const move = buildBudgetDragMove({
    activeId: getGroupSortableId("bills"),
    overId: getGroupSortableId("everyday"),
    visibleCategoryGroups,
  });

  assert.deepEqual(move, {
    type: "group",
    activeGroupId: "bills",
    targetGroupId: "everyday",
    placement: "after",
  });
}

function testIgnoresMissingAndMismatchedDrops() {
  assert.equal(
    buildBudgetDragMove({
      activeId: getCategorySortableId("rent"),
      overId: null,
      visibleCategoryGroups,
    }),
    null,
  );

  assert.equal(
    buildBudgetDragMove({
      activeId: getCategorySortableId("rent"),
      overId: getGroupSortableId("bills"),
      visibleCategoryGroups,
    }),
    null,
  );
}

function run() {
  testExtractionBoundary();
  testCategoryMoveWithinSameGroupAfterTarget();
  testCategoryMoveAcrossGroupsBeforeTarget();
  testGroupMoveAfterTarget();
  testIgnoresMissingAndMismatchedDrops();
  console.log("v2.60.11 budget drag/drop extraction checks passed");
}

run();
