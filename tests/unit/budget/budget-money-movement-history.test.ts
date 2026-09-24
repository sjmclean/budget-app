import assert from "node:assert/strict";
import test from "node:test";

import type { UndoRedoHistoryEntry } from "../../../apps/web/src/features/history/undoRedo.js";
import { deriveBudgetMoneyMovementHistory } from "../../../apps/web/src/features/budget/budgetMoneyMovementHistory.js";

function assignmentEntry(
  id: string,
  changes: Array<{
    categoryId: string;
    categoryName: string;
    originalAssigned: number;
    finalAssigned: number;
  }>,
): UndoRedoHistoryEntry {
  return {
    id,
    kind: "budget-assignment-changes",
    occurredAt: `2026-09-24T04:00:0${id.at(-1) ?? "0"}Z`,
    payload: {
      month: "2026-09",
      changes,
    },
  };
}

test("manual source decrease followed by matching destination increase is shown as a movement", () => {
  const entries = [
    assignmentEntry("edit-1", [{
      categoryId: "groceries",
      categoryName: "Groceries",
      originalAssigned: 100,
      finalAssigned: 90,
    }]),
    assignmentEntry("edit-2", [{
      categoryId: "dining",
      categoryName: "Dining",
      originalAssigned: 20,
      finalAssigned: 30,
    }]),
  ];

  assert.deepEqual(deriveBudgetMoneyMovementHistory(entries, "AUD"), [{
    id: "manual-money-movement:edit-1|edit-2:dining",
    kind: "budget-money-movement",
    occurredAt: "2026-09-24T04:00:02Z",
    payload: {
      month: "2026-09",
      currencyCode: "AUD",
      amount: 10,
      sources: [{
        categoryId: "groceries",
        categoryName: "Groceries",
        amount: 10,
      }],
      destinationCategoryId: "dining",
      destinationCategoryName: "Dining",
    },
  }]);
});

test("manual movement can combine multiple source decreases into one destination", () => {
  const entries = [
    assignmentEntry("edit-1", [{
      categoryId: "groceries",
      categoryName: "Groceries",
      originalAssigned: 100,
      finalAssigned: 95,
    }]),
    assignmentEntry("edit-2", [{
      categoryId: "fuel",
      categoryName: "Fuel",
      originalAssigned: 50,
      finalAssigned: 45,
    }]),
    assignmentEntry("edit-3", [{
      categoryId: "dining",
      categoryName: "Dining",
      originalAssigned: 20,
      finalAssigned: 30,
    }]),
  ];

  const [movement] = deriveBudgetMoneyMovementHistory(entries, "AUD");
  assert.equal(movement?.payload.amount, 10);
  assert.deepEqual(movement?.payload.sources, [
    { categoryId: "groceries", categoryName: "Groceries", amount: 5 },
    { categoryId: "fuel", categoryName: "Fuel", amount: 5 },
  ]);
  assert.equal(movement?.payload.destinationCategoryId, "dining");
});

test("a lone manual assignment remains an assignment and is not labelled as money moved", () => {
  const entries = [
    assignmentEntry("edit-1", [{
      categoryId: "groceries",
      categoryName: "Groceries",
      originalAssigned: 100,
      finalAssigned: 110,
    }]),
  ];

  assert.deepEqual(deriveBudgetMoneyMovementHistory(entries, "AUD"), []);
});

test("undoing either side of a manual reallocation removes the derived movement", () => {
  const sourceOnly = [
    assignmentEntry("edit-1", [{
      categoryId: "groceries",
      categoryName: "Groceries",
      originalAssigned: 100,
      finalAssigned: 90,
    }]),
  ];
  const balanced = [
    ...sourceOnly,
    assignmentEntry("edit-2", [{
      categoryId: "dining",
      categoryName: "Dining",
      originalAssigned: 20,
      finalAssigned: 30,
    }]),
  ];

  assert.equal(deriveBudgetMoneyMovementHistory(balanced, "AUD").length, 1);
  assert.equal(deriveBudgetMoneyMovementHistory(sourceOnly, "AUD").length, 0);
});

test("explicit Move Money history is preserved and never re-derived", () => {
  const explicit: UndoRedoHistoryEntry = {
    id: "move-1",
    kind: "budget-money-movement",
    occurredAt: "2026-09-24T04:00:00Z",
    payload: {
      month: "2026-09",
      currencyCode: "AUD",
      amount: 10,
      sources: [{
        categoryId: "groceries",
        categoryName: "Groceries",
        amount: 10,
      }],
      destinationCategoryId: "dining",
      destinationCategoryName: "Dining",
    },
  };

  assert.deepEqual(deriveBudgetMoneyMovementHistory([explicit], "AUD"), [explicit]);
});

test("manual assignment history without a currency is not presented as a movement", () => {
  const entries = [
    assignmentEntry("edit-1", [{
      categoryId: "groceries",
      categoryName: "Groceries",
      originalAssigned: 100,
      finalAssigned: 90,
    }]),
    assignmentEntry("edit-2", [{
      categoryId: "dining",
      categoryName: "Dining",
      originalAssigned: 20,
      finalAssigned: 30,
    }]),
  ];

  assert.deepEqual(deriveBudgetMoneyMovementHistory(entries, null), []);
});
