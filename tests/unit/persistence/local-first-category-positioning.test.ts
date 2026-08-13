import assert from "node:assert/strict";
import { test } from "node:test";

import {
  moveBudgetCategoryToTarget,
} from "../../../apps/web/src/features/persistence/localFirst/localFirstAccountRegisterClient.ts";

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
