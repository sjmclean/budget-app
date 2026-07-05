import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BudgetCategoryGroupView } from "../apps/web/src/features/budget/budgetViewTypes";
import {
  buildOverspendingCoverOptions,
  countArchivedCategories,
  countOverspentCategories,
  findCategoryLocation,
  getVisibleCategoryGroups,
  isSelectedCategoryVisible,
} from "../apps/web/src/features/budget/budgetWorkspaceSelectors";

function category(input: {
  id: string;
  name?: string;
  available?: number;
  isArchived?: boolean;
}) {
  return {
    id: input.id,
    name: input.name ?? input.id,
    previousAvailable: 0,
    assigned: 0,
    activity: 0,
    available: input.available ?? 0,
    isOverspent: (input.available ?? 0) < 0,
    isArchived: input.isArchived ?? false,
    note: "",
  };
}

function group(input: {
  id: string;
  name?: string;
  categories: ReturnType<typeof category>[];
}): BudgetCategoryGroupView {
  return {
    id: input.id,
    name: input.name ?? input.id,
    previousAvailable: 0,
    assigned: 0,
    activity: 0,
    available: 0,
    note: "",
    categories: input.categories,
  };
}

const groups = [
  group({
    id: "housing",
    name: "Housing",
    categories: [
      category({ id: "mortgage", name: "Mortgage", available: -50 }),
      category({ id: "old-rent", name: "Old Rent", available: 20, isArchived: true }),
    ],
  }),
  group({
    id: "empty-after-filter",
    name: "Empty after filter",
    categories: [category({ id: "closed", available: 10, isArchived: true })],
  }),
  group({
    id: "living",
    name: "Living",
    categories: [category({ id: "groceries", name: "Groceries", available: 125 })],
  }),
];

function testVisibleCategoryGroups() {
  assert.equal(getVisibleCategoryGroups(groups, false), groups);

  const visible = getVisibleCategoryGroups(groups, true);

  assert.deepEqual(
    visible.map((visibleGroup) => ({
      id: visibleGroup.id,
      categoryIds: visibleGroup.categories.map((visibleCategory) => visibleCategory.id),
    })),
    [
      { id: "housing", categoryIds: ["mortgage"] },
      { id: "living", categoryIds: ["groceries"] },
    ],
  );
}

function testCounts() {
  assert.equal(countArchivedCategories(groups), 2);
  assert.equal(countOverspentCategories(groups), 1);
}

function testSelectedCategoryVisibility() {
  assert.equal(isSelectedCategoryVisible(null, false), false);
  assert.equal(isSelectedCategoryVisible(groups[0].categories[0], true), true);
  assert.equal(isSelectedCategoryVisible(groups[0].categories[1], true), false);
  assert.equal(isSelectedCategoryVisible(groups[0].categories[1], false), true);
}

function testCoverOptions() {
  assert.deepEqual(buildOverspendingCoverOptions(groups), [
    { id: "mortgage", name: "Mortgage", groupName: "Housing", available: -50 },
    { id: "groceries", name: "Groceries", groupName: "Living", available: 125 },
  ]);
}

function testFindCategoryLocation() {
  const visible = getVisibleCategoryGroups(groups, true);

  assert.deepEqual(findCategoryLocation(visible, "mortgage"), {
    groupId: "housing",
    index: 0,
  });
  assert.deepEqual(findCategoryLocation(visible, "groceries"), {
    groupId: "living",
    index: 0,
  });
  assert.equal(findCategoryLocation(visible, "old-rent"), null);
}

function testExtractionBoundary() {
  const budgetPageSource = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");
  const selectorSource = readFileSync(
    "apps/web/src/features/budget/budgetWorkspaceSelectors.ts",
    "utf8",
  );

  assert.match(
    budgetPageSource,
    /from "\.\.\/features\/budget\/budgetWorkspaceSelectors"/,
    "BudgetPage should import the extracted workspace selectors",
  );
  assert.match(
    selectorSource,
    /export function getVisibleCategoryGroups/,
    "Workspace selector module should own visible category filtering",
  );
}

function run() {
  testVisibleCategoryGroups();
  testCounts();
  testSelectedCategoryVisibility();
  testCoverOptions();
  testFindCategoryLocation();
  testExtractionBoundary();
  console.log("v2.60.9 budget workspace selector extraction checks passed");
}

run();
