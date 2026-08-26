import assert from "node:assert/strict";
import test from "node:test";
import type {
  BudgetCategoryView,
  BudgetMonthView,
} from "../../../apps/web/src/features/budget/budgetViewTypes.js";
import { resolveActiveCategorySelection } from "../../../apps/web/src/features/budget/useBudgetWorkspace.js";

function category(
  id: string,
  isArchived = false,
): BudgetCategoryView {
  return {
    id,
    name: id,
    previousAvailable: 0,
    assigned: 0,
    activity: 0,
    available: 0,
    isOverspent: false,
    isArchived,
    note: "",
  };
}

function view(categories: BudgetCategoryView[]): BudgetMonthView {
  return {
    budgetId: "budget-1",
    month: "2026-08",
    currencyCode: "AUD",
    readyToAssign: 0,
    categoryGroups: [{
      id: "group-1",
      name: "Group",
      previousAvailable: 0,
      assigned: 0,
      activity: 0,
      available: 0,
      note: "",
      categories,
    }],
  };
}

test("archiving the selected category clears active-workspace selection", () => {
  assert.equal(
    resolveActiveCategorySelection("selected", view([
      category("selected", true),
      category("other"),
    ])),
    null,
  );
});

test("archiving an unrelated category preserves the active selection", () => {
  assert.equal(
    resolveActiveCategorySelection("selected", view([
      category("selected"),
      category("other", true),
    ])),
    "selected",
  );
});

test("ordinary reprojection preserves a category that remains active", () => {
  const reprojected = category("selected");
  reprojected.assigned = 125;
  reprojected.available = 125;

  assert.equal(
    resolveActiveCategorySelection("selected", view([reprojected])),
    "selected",
  );
});

test("removed selections clear while merge keeps the surviving active target", () => {
  const merged = view([category("target")]);

  assert.equal(resolveActiveCategorySelection("source", merged), null);
  assert.equal(
    resolveActiveCategorySelection("source", merged, "target"),
    "target",
  );
});
