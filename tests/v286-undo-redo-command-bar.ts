import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  executeUndoableBudgetMoneyMovement,
  getBudgetUndoRedoSnapshot,
  redoBudgetAction,
  registerBudgetUndoRedoContext,
  undoBudgetAction,
} from "../apps/web/src/features/budget/budgetUndoRedo";
import { applyCategoryAssignedValues } from "../apps/web/src/features/budget/budgetMoneyMovement";
import type { BudgetMonthView } from "../apps/web/src/features/budget/budgetViewTypes";

let view: BudgetMonthView = {
  month: "2026-07",
  monthLabel: "July 2026",
  currencyCode: "AUD",
  readyToAssign: 0,
  totalAssigned: 700,
  totalActivity: -100,
  totalAvailable: 600,
  categoryGroups: [
    {
      id: "main",
      name: "Main Expenses",
      previousAvailable: 0,
      assigned: 700,
      activity: -100,
      available: 600,
      note: "",
      categories: [
        {
          id: "source",
          name: "Income Holding",
          previousAvailable: 0,
          assigned: 600,
          activity: 0,
          available: 600,
          isArchived: false,
          isOverspent: false,
          note: "",
        },
        {
          id: "destination",
          name: "Internet",
          previousAvailable: 0,
          assigned: 100,
          activity: -100,
          available: 0,
          isArchived: false,
          isOverspent: false,
          note: "",
        },
      ],
    },
  ],
};

const unregister = registerBudgetUndoRedoContext("budget:2026-07", {
  getBudgetMonthView() {
    return view;
  },
  setCategoryAssignedValues({ assignments }) {
    view = applyCategoryAssignedValues(view, assignments);
    return view;
  },
});

const moveResult = await executeUndoableBudgetMoneyMovement({
  month: "2026-07",
  sourceCategoryId: "source",
  destinationCategoryId: "destination",
  amount: 50,
});
assert.equal(moveResult.performed, true);
assert.equal(getBudgetUndoRedoSnapshot().canUndo, true);
assert.match(getBudgetUndoRedoSnapshot().undoLabel ?? "", /Income Holding.*Internet/);

await undoBudgetAction();
assert.equal(getBudgetUndoRedoSnapshot().canRedo, true);
assert.equal(view.categoryGroups[0].categories[0].assigned, 600);
assert.equal(view.categoryGroups[0].categories[1].assigned, 100);

await redoBudgetAction();
assert.equal(view.categoryGroups[0].categories[0].assigned, 550);
assert.equal(view.categoryGroups[0].categories[1].assigned, 150);
unregister();
assert.equal(getBudgetUndoRedoSnapshot().canUndo, false);

const topBar = readFileSync("apps/web/src/layouts/TopBar.tsx", "utf8");
const integrationScript = readFileSync(
  "scripts/apply-v286-budget-undo-redo-integration.mjs",
  "utf8",
);

assert.match(topBar, /useBudgetUndoRedo/);
assert.match(topBar, /createUndoRedoKeyboardHandler/);
assert.match(topBar, />Undo</);
assert.match(topBar, />Redo</);
assert.match(topBar, /disabled=\{!canUndo \|\| isBusy\}/);
assert.match(topBar, /disabled=\{!canRedo \|\| isBusy\}/);
assert.match(topBar, /Undo \$\{undoLabel\}/);
assert.match(topBar, /Redo \$\{redoLabel\}/);
assert.match(integrationScript, /registerBudgetUndoRedoContext/);
assert.match(integrationScript, /executeUndoableBudgetMoneyMovement/);
assert.match(integrationScript, /sourceCategoryId: input\.coveringCategoryId/);
assert.match(integrationScript, /destinationCategoryId: input\.overspentCategoryId/);
assert.doesNotMatch(integrationScript, /categoriesPersistence\n      \.coverOverspending/);

console.log("v2.86 undo redo command bar checks passed");
