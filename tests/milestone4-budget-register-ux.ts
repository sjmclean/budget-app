import assert from "node:assert/strict";
import { evaluateAssignedInput } from "../apps/web/src/features/budget/evaluateAssignedInput";
import { previewCategoryAssignment } from "../apps/web/src/features/budget/budgetAssignmentPreview";
import type { BudgetMonthView } from "../apps/web/src/features/budget/budgetViewTypes";

assert.equal(evaluateAssignedInput("+50", 100), 150);
assert.equal(evaluateAssignedInput("-25", 100), 75);
assert.equal(evaluateAssignedInput("12*4", 0), 48);
assert.equal(evaluateAssignedInput("200/2", 0), 100);
assert.equal(evaluateAssignedInput("$1,250.50", 0), 1250.5);
assert.equal(evaluateAssignedInput("", 0), null);
assert.equal(evaluateAssignedInput("alert(1)", 0), null);

const view: BudgetMonthView = {
  budgetId: "budget-ux",
  budgetName: "UX budget",
  monthLabel: "August 2026",
  currencyCode: "AUD",
  readyToAssign: 500,
  carriedForwardReadyToAssign: 0,
  previousOverspending: 0,
  incomeForMonth: 500,
  totalAssigned: 100,
  totalActivity: -20,
  totalAvailable: 80,
  categoryGroups: [{
    id: "group-1",
    name: "Main expenses",
    previousAvailable: 0,
    assigned: 100,
    activity: -20,
    available: 80,
    note: "",
    categories: [{
      id: "category-1",
      name: "Groceries",
      previousAvailable: 0,
      assigned: 100,
      activity: -20,
      available: 80,
      isOverspent: false,
      isArchived: false,
      note: "",
    }],
  }],
};

const optimistic = previewCategoryAssignment(view, "category-1", 150);
assert.equal(optimistic.readyToAssign, 450);
assert.equal(optimistic.totalAssigned, 150);
assert.equal(optimistic.categoryGroups[0]?.assigned, 150);
assert.equal(optimistic.categoryGroups[0]?.available, 130);
assert.equal(optimistic.categoryGroups[0]?.categories[0]?.available, 130);

console.log("Milestone 4 budget assignment expression contracts passed.");
