import assert from "node:assert/strict";
import { createUndoRedoController } from "../apps/web/src/features/history/undoRedo";
import {
  createBudgetAssignmentChangesCommand,
  createBudgetAssignmentEditSession,
} from "../apps/web/src/features/budget/budgetAssignmentEditing";
import type { BudgetMoneyMovementContext } from "../apps/web/src/features/budget/budgetMoneyMovement";
import type { BudgetMonthView } from "../apps/web/src/features/budget/budgetViewTypes";

function createView(): BudgetMonthView {
  return {
    month: "2026-07",
    monthLabel: "July 2026",
    currencyCode: "AUD",
    readyToAssign: 0,
    totalAssigned: 600,
    totalActivity: 0,
    totalAvailable: 600,
    categoryGroups: [
      {
        id: "group-1",
        name: "Savings",
        note: "",
        previousAvailable: 0,
        assigned: 600,
        activity: 0,
        available: 600,
        categories: [
          {
            id: "emergency",
            name: "Emergency Fund",
            note: "",
            previousAvailable: 0,
            assigned: 500,
            activity: 0,
            available: 500,
            isArchived: false,
            isOverspent: false,
          },
          {
            id: "mobile",
            name: "Mobile",
            note: "",
            previousAvailable: 0,
            assigned: 100,
            activity: 0,
            available: 100,
            isArchived: false,
            isOverspent: false,
          },
        ],
      },
    ],
  };
}

function findAssigned(view: BudgetMonthView, categoryId: string): number {
  for (const group of view.categoryGroups) {
    const category = group.categories.find((item) => item.id === categoryId);
    if (category) return category.assigned;
  }
  throw new Error(`Missing category ${categoryId}`);
}

let view = createView();
const context: BudgetMoneyMovementContext = {
  getBudgetMonthView() {
    return view;
  },
  setCategoryAssignedValues({ assignments }) {
    const values = new Map(assignments.map((item) => [item.categoryId, item.assigned]));
    view = {
      ...view,
      categoryGroups: view.categoryGroups.map((group) => ({
        ...group,
        categories: group.categories.map((category) => ({
          ...category,
          assigned: values.get(category.id) ?? category.assigned,
          available: values.get(category.id) ?? category.available,
        })),
      })),
    };
    return view;
  },
};

const controller = createUndoRedoController<BudgetMoneyMovementContext>({
  getContext: () => context,
});

const session = createBudgetAssignmentEditSession();
session.record({
  categoryId: "emergency",
  categoryName: "Emergency Fund",
  originalAssigned: 500,
  finalAssigned: 450,
});
session.record({
  categoryId: "mobile",
  categoryName: "Mobile",
  originalAssigned: 100,
  finalAssigned: 150,
});
assert.equal(session.hasChanges(), true);
const groupedChanges = session.consume();
assert.equal(groupedChanges.length, 2);
assert.equal(session.hasChanges(), false);

const executeResult = await controller.execute(
  createBudgetAssignmentChangesCommand({
    month: "2026-07",
    changes: groupedChanges,
  }),
);
assert.equal(executeResult.performed, true);
assert.equal(findAssigned(view, "emergency"), 450);
assert.equal(findAssigned(view, "mobile"), 150);
assert.equal(controller.getSnapshot().undoLabel, "Change 2 budget assignments");

const undoResult = await controller.undo();
assert.equal(undoResult.performed, true);
assert.equal(findAssigned(view, "emergency"), 500);
assert.equal(findAssigned(view, "mobile"), 100);

const redoResult = await controller.redo();
assert.equal(redoResult.performed, true);
assert.equal(findAssigned(view, "emergency"), 450);
assert.equal(findAssigned(view, "mobile"), 150);

const repeatedEditSession = createBudgetAssignmentEditSession();
repeatedEditSession.record({
  categoryId: "emergency",
  categoryName: "Emergency Fund",
  originalAssigned: 500,
  finalAssigned: 475,
});
repeatedEditSession.record({
  categoryId: "emergency",
  categoryName: "Emergency Fund",
  originalAssigned: 475,
  finalAssigned: 450,
});
const repeatedChanges = repeatedEditSession.consume();
assert.equal(repeatedChanges.length, 1);
assert.equal(repeatedChanges[0].originalAssigned, 500);
assert.equal(repeatedChanges[0].finalAssigned, 450);

const cancelledSession = createBudgetAssignmentEditSession();
cancelledSession.record({
  categoryId: "mobile",
  categoryName: "Mobile",
  originalAssigned: 100,
  finalAssigned: 150,
});
cancelledSession.record({
  categoryId: "mobile",
  categoryName: "Mobile",
  originalAssigned: 150,
  finalAssigned: 100,
});
assert.equal(cancelledSession.hasChanges(), false);

console.log("v2.87 undoable budget assignment editing checks passed");
