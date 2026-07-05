import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBudgetInspectorState } from "../apps/web/src/features/budget/budgetInspectorState";
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

function group(categories: BudgetCategoryView[]): BudgetCategoryGroupView {
  return {
    id: "bills",
    name: "Bills",
    note: "",
    categories,
  };
}

function testBoundary() {
  const budgetPageSource = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");
  const inspectorSource = readFileSync(
    "apps/web/src/features/budget/budgetInspectorState.ts",
    "utf8",
  );

  assert.match(
    budgetPageSource,
    /from "\.\.\/features\/budget\/budgetInspectorState"/,
    "BudgetPage should depend on the extracted inspector state helper",
  );
  assert.doesNotMatch(
    budgetPageSource,
    /isSelectedCategoryVisible\(/,
    "BudgetPage should no longer own selected-category visibility checks",
  );
  assert.match(
    inspectorSource,
    /isSelectedCategoryVisible/,
    "Inspector state helper should own selected-category visibility checks",
  );
}

function testVisibleSelectedCategoryState() {
  const selectedCategory = category({ id: "groceries", name: "Groceries" });
  const selectedGroup = group([selectedCategory]);

  const state = buildBudgetInspectorState({
    selectedCategory,
    selectedGroup,
    hideArchivedCategories: true,
    overassignedCategoryIds: [],
  });

  assert.equal(state.visibleSelectedCategory, selectedCategory);
  assert.equal(state.visibleSelectedGroup, selectedGroup);
  assert.equal(state.selectedCategoryIsOverassignedSource, false);
}

function testHiddenArchivedCategoryState() {
  const selectedCategory = category({ isArchived: true });
  const selectedGroup = group([selectedCategory]);

  const state = buildBudgetInspectorState({
    selectedCategory,
    selectedGroup,
    hideArchivedCategories: true,
    overassignedCategoryIds: [selectedCategory.id],
  });

  assert.equal(state.visibleSelectedCategory, null);
  assert.equal(state.visibleSelectedGroup, null);
  assert.equal(
    state.selectedCategoryIsOverassignedSource,
    false,
    "Hidden archived categories should not remain active inspector overassigned sources",
  );
}

function testOverassignedSourceState() {
  const selectedCategory = category({ id: "dining" });
  const selectedGroup = group([selectedCategory]);

  const state = buildBudgetInspectorState({
    selectedCategory,
    selectedGroup,
    hideArchivedCategories: false,
    overassignedCategoryIds: ["dining"],
  });

  assert.equal(state.visibleSelectedCategory?.id, "dining");
  assert.equal(state.selectedCategoryIsOverassignedSource, true);
}

function run() {
  testBoundary();
  testVisibleSelectedCategoryState();
  testHiddenArchivedCategoryState();
  testOverassignedSourceState();
  console.log("v2.60.10 budget inspector state extraction checks passed");
}

run();
