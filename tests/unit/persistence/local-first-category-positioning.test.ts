import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mutateBudgetCategory,
  moveBudgetCategoryToTarget,
} from "../../../apps/web/src/features/persistence/localFirst/engine/categoryCommandHelpers.ts";

function view() {
  return {
    budgetId: "budget-a", budgetName: "Budget", monthLabel: "September", currencyCode: "AUD",
    readyToAssign: 0, totalAssigned: 0, totalActivity: 0, totalAvailable: 0,
    categoryGroups: [
      { id: "group-a", name: "A", previousAvailable: 0, assigned: 0, activity: 0, available: 0, note: "", categories: [
        { id: "category-a", name: "A", previousAvailable: 1, assigned: 2, activity: 3, available: 4, isOverspent: false, isArchived: false, note: "" },
        { id: "category-b", name: "B", previousAvailable: 10, assigned: 20, activity: 30, available: 40, isOverspent: false, isArchived: false, note: "" },
      ] },
      { id: "group-b", name: "B", previousAvailable: 0, assigned: 0, activity: 0, available: 0, note: "", categories: [] },
    ],
  };
}

test("category command helper preserves every supported operation family", () => {
  let next = mutateBudgetCategory(view(), { operation: "create", month: "2026-09", groupId: "group-b", categoryId: "category-c", name: "C" });
  assert.equal(next.categoryGroups[1]!.categories[0]!.id, "category-c");
  next = mutateBudgetCategory(next, { operation: "rename", month: "2026-09", categoryId: "category-c", name: "Renamed" });
  next = mutateBudgetCategory(next, { operation: "archive", month: "2026-09", categoryId: "category-c", isArchived: true });
  next = mutateBudgetCategory(next, { operation: "category-note", month: "2026-09", categoryId: "category-c", note: "category note" });
  next = mutateBudgetCategory(next, { operation: "group-note", month: "2026-09", groupId: "group-b", note: "group note" });
  next = mutateBudgetCategory(next, { operation: "overspending", month: "2026-09", categoryId: "category-c", overspendingHandling: "carry-category" });
  const category = next.categoryGroups[1]!.categories[0]!;
  assert.deepEqual(
    { name: category.name, archived: category.isArchived, note: category.note, policy: category.overspendingHandling },
    { name: "Renamed", archived: true, note: "category note", policy: "carry-category" },
  );
  assert.equal(next.categoryGroups[1]!.note, "group note");

  next = mutateBudgetCategory(next, { operation: "move-category", month: "2026-09", categoryId: "category-b", direction: "up" });
  assert.deepEqual(next.categoryGroups[0]!.categories.map(({ id }) => id), ["category-b", "category-a"]);
  next = mutateBudgetCategory(next, { operation: "move-group", month: "2026-09", groupId: "group-b", direction: "up" });
  assert.equal(next.categoryGroups[0]!.id, "group-b");
  next = mutateBudgetCategory(next, { operation: "position-group", month: "2026-09", groupId: "group-b", targetGroupId: "group-a", placement: "after" });
  assert.equal(next.categoryGroups[1]!.id, "group-b");
  next = mutateBudgetCategory(next, { operation: "position-category", month: "2026-09", categoryId: "category-c", targetGroupId: "group-a", placement: "after" });
  assert.equal(next.categoryGroups[0]!.categories.at(-1)!.id, "category-c");

  next = mutateBudgetCategory(view(), { operation: "merge", month: "2026-09", categoryId: "category-a", targetCategoryId: "category-b" });
  assert.deepEqual(next.categoryGroups[0]!.categories.map(({ id }) => id), ["category-b"]);
  assert.deepEqual(
    { previous: next.categoryGroups[0]!.categories[0]!.previousAvailable, assigned: next.categoryGroups[0]!.categories[0]!.assigned, activity: next.categoryGroups[0]!.categories[0]!.activity, available: next.categoryGroups[0]!.categories[0]!.available },
    { previous: 11, assigned: 22, activity: 33, available: 44 },
  );
});

test("position-category moves a category across groups", () => {
  const groups = [
    {
      id: "group-a",
      name: "Group A",
      previousAvailable: 0,
      assigned: 0,
      activity: 0,
      available: 0,
      note: "",
      categories: [
        {
          id: "category-a",
          name: "Category A",
          previousAvailable: 100,
          assigned: 200,
          activity: -50,
          available: 250,
          isOverspent: false,
          isArchived: false,
          note: "keep me",
        },
      ],
    },
    {
      id: "group-b",
      name: "Group B",
      previousAvailable: 0,
      assigned: 0,
      activity: 0,
      available: 0,
      note: "",
      categories: [
        {
          id: "category-b",
          name: "Category B",
          previousAvailable: 0,
          assigned: 0,
          activity: 0,
          available: 0,
          isOverspent: false,
          isArchived: false,
          note: "",
        },
        {
          id: "category-c",
          name: "Category C",
          previousAvailable: 0,
          assigned: 0,
          activity: 0,
          available: 0,
          isOverspent: false,
          isArchived: false,
          note: "",
        },
      ],
    },
  ];

  const moved = moveBudgetCategoryToTarget(
    groups,
    "category-a",
    "category-b",
    "before",
  );

  assert.deepEqual(
    moved.map((group) => ({
      id: group.id,
      categoryIds: group.categories.map((category) => category.id),
    })),
    [
      {
        id: "group-a",
        categoryIds: [],
      },
      {
        id: "group-b",
        categoryIds: ["category-a", "category-b", "category-c"],
      },
    ],
  );

  const category = moved[1]?.categories[0];
  assert.ok(category);
  assert.equal(category.id, "category-a");
  assert.equal(category.previousAvailable, 100);
  assert.equal(category.assigned, 200);
  assert.equal(category.activity, -50);
  assert.equal(category.available, 250);
  assert.equal(category.note, "keep me");
});

test("position-category still reorders within the same group", () => {
  const groups = [
    {
      id: "group-a",
      name: "Group A",
      previousAvailable: 0,
      assigned: 0,
      activity: 0,
      available: 0,
      note: "",
      categories: [
        {
          id: "category-a",
          name: "Category A",
          previousAvailable: 0,
          assigned: 0,
          activity: 0,
          available: 0,
          isOverspent: false,
          isArchived: false,
          note: "",
        },
        {
          id: "category-b",
          name: "Category B",
          previousAvailable: 0,
          assigned: 0,
          activity: 0,
          available: 0,
          isOverspent: false,
          isArchived: false,
          note: "",
        },
      ],
    },
  ];

  const moved = moveBudgetCategoryToTarget(
    groups,
    "category-a",
    "category-b",
    "after",
  );

  assert.deepEqual(
    moved[0]?.categories.map((category) => category.id),
    ["category-b", "category-a"],
  );
});

test("position-category moves a category into an empty target group", () => {
  const category = { id: "category-a", name: "Category A", assigned: 200, note: "keep me" };
  const groups = [
    { id: "group-a", categories: [category] },
    { id: "group-empty", categories: [] },
  ];

  const moved = moveBudgetCategoryToTarget(
    groups, "category-a", undefined, "after", "group-empty",
  );

  assert.deepEqual(moved.map((group) => group.categories.map(({ id }) => id)), [[], ["category-a"]]);
  assert.strictEqual(moved[1]?.categories[0], category);
});

test("position-category preserves the original grouping when the target is missing", () => {
  const groups = [
    {
      id: "group-a",
      name: "Group A",
      previousAvailable: 0,
      assigned: 0,
      activity: 0,
      available: 0,
      note: "",
      categories: [
        {
          id: "category-a",
          name: "Category A",
          previousAvailable: 100,
          assigned: 200,
          activity: -50,
          available: 250,
          isOverspent: false,
          isArchived: false,
          note: "keep me",
        },
      ],
    },
    {
      id: "group-b",
      name: "Group B",
      previousAvailable: 0,
      assigned: 0,
      activity: 0,
      available: 0,
      note: "",
      categories: [],
    },
  ];

  const moved = moveBudgetCategoryToTarget(
    groups,
    "category-a",
    "missing-category",
    "before",
  );

  assert.deepEqual(
    moved.map((group) => ({
      id: group.id,
      categoryIds: group.categories.map((category) => category.id),
    })),
    [
      { id: "group-a", categoryIds: ["category-a"] },
      { id: "group-b", categoryIds: [] },
    ],
  );

  assert.equal(moved[0]?.categories[0]?.note, "keep me");
});
