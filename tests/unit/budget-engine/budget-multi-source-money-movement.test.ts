import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCategoryAssignedValues,
  createMoveBudgetMoneyFromMultipleSourcesCommand,
  type BudgetMoneyMovementContext,
} from "../../../apps/web/src/features/budget/budgetMoneyMovement.js";
import type { BudgetMonthView } from "../../../apps/web/src/features/budget/budgetViewTypes.js";

function view(): BudgetMonthView {
  return {
    month: "2026-08",
    currencyCode: "AUD",
    readyToAssign: 0,
    totalAssigned: 330,
    totalActivity: -420,
    totalAvailable: -90,
    previousOverspending: 0,
    categoryGroups: [
      {
        id: "everyday",
        name: "Everyday",
        previousAvailable: 0,
        assigned: 230,
        activity: -100,
        available: 130,
        note: "",
        categories: [
          {
            id: "groceries",
            name: "Groceries",
            previousAvailable: 0,
            assigned: 200,
            activity: -50,
            available: 150,
            isOverspent: false,
            isArchived: false,
            note: "",
          },
          {
            id: "fuel",
            name: "Fuel",
            previousAvailable: 0,
            assigned: 30,
            activity: -10,
            available: 20,
            isOverspent: false,
            isArchived: false,
            note: "",
          },
        ],
      },
      {
        id: "fun",
        name: "Fun",
        previousAvailable: 0,
        assigned: 100,
        activity: -320,
        available: -220,
        note: "",
        categories: [
          {
            id: "entertainment",
            name: "Entertainment",
            previousAvailable: 0,
            assigned: 100,
            activity: -100,
            available: 0,
            isOverspent: false,
            isArchived: false,
            note: "",
          },
          {
            id: "dining",
            name: "Dining Out",
            previousAvailable: 0,
            assigned: 0,
            activity: -220,
            available: -220,
            isOverspent: true,
            isArchived: false,
            note: "",
          },
        ],
      },
    ],
  };
}

test("multi-source movement conserves assigned money in one assignment batch", async () => {
  let current = view();
  const batches: { categoryId: string; assigned: number }[][] = [];

  const context: BudgetMoneyMovementContext = {
    getBudgetMonthView() {
      return current;
    },
    setCategoryAssignedValues({ assignments }) {
      batches.push(assignments);
      current = applyCategoryAssignedValues(current, assignments);
      return current;
    },
  };

  const command = createMoveBudgetMoneyFromMultipleSourcesCommand({
    month: "2026-08",
    destinationCategoryId: "dining",
    sources: [
      { categoryId: "groceries", amount: 50 },
      { categoryId: "fuel", amount: 20 },
    ],
  });

  await command.execute(context);

  assert.equal(batches.length, 1);
  assert.deepEqual(
    batches[0].map(({ categoryId }) => categoryId),
    ["groceries", "fuel", "dining"],
  );

  const categories = current.categoryGroups.flatMap((group) => group.categories);
  assert.equal(categories.find(({ id }) => id === "groceries")?.assigned, 150);
  assert.equal(categories.find(({ id }) => id === "fuel")?.assigned, 10);
  assert.equal(categories.find(({ id }) => id === "dining")?.assigned, 70);
  assert.equal(current.totalAssigned, 330);
  assert.equal(current.readyToAssign, 0);
});

test("multi-source movement undo restores every source and destination together", async () => {
  let current = view();
  let writeCount = 0;

  const context: BudgetMoneyMovementContext = {
    getBudgetMonthView() {
      return current;
    },
    setCategoryAssignedValues({ assignments }) {
      writeCount += 1;
      current = applyCategoryAssignedValues(current, assignments);
      return current;
    },
  };

  const command = createMoveBudgetMoneyFromMultipleSourcesCommand({
    month: "2026-08",
    destinationCategoryId: "dining",
    sources: [
      { categoryId: "groceries", amount: 50 },
      { categoryId: "fuel", amount: 20 },
    ],
  });

  await command.execute(context);
  await command.undo(context);

  assert.equal(writeCount, 2);

  const categories = current.categoryGroups.flatMap((group) => group.categories);
  assert.equal(categories.find(({ id }) => id === "groceries")?.assigned, 200);
  assert.equal(categories.find(({ id }) => id === "fuel")?.assigned, 30);
  assert.equal(categories.find(({ id }) => id === "dining")?.assigned, 0);
});

test("multi-source movement refuses a source contribution above Available", async () => {
  const current = view();
  let writes = 0;

  const context: BudgetMoneyMovementContext = {
    getBudgetMonthView() {
      return current;
    },
    setCategoryAssignedValues() {
      writes += 1;
      return current;
    },
  };

  const command = createMoveBudgetMoneyFromMultipleSourcesCommand({
    month: "2026-08",
    destinationCategoryId: "dining",
    sources: [{ categoryId: "fuel", amount: 25 }],
  });

  await assert.rejects(
    command.execute(context),
    /Fuel has insufficient available funds/,
  );
  assert.equal(writes, 0);
});

test("multi-source movement rejects duplicate source categories", async () => {
  const current = view();

  const context: BudgetMoneyMovementContext = {
    getBudgetMonthView() {
      return current;
    },
    setCategoryAssignedValues() {
      return current;
    },
  };

  const command = createMoveBudgetMoneyFromMultipleSourcesCommand({
    month: "2026-08",
    destinationCategoryId: "dining",
    sources: [
      { categoryId: "groceries", amount: 10 },
      { categoryId: "groceries", amount: 10 },
    ],
  });

  await assert.rejects(
    command.execute(context),
    /must not contain duplicates/,
  );
});
