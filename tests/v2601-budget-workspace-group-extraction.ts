import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const budgetPagePath = join(process.cwd(), "apps/web/src/pages/BudgetPage.tsx");
const workspaceGroupPath = join(
  process.cwd(),
  "apps/web/src/features/budget/BudgetWorkspaceGroup.tsx",
);
const moneyDisplayPath = join(
  process.cwd(),
  "apps/web/src/features/budget/budgetMoneyDisplay.ts",
);

assert.ok(existsSync(workspaceGroupPath), "Budget workspace group component should exist");
assert.ok(existsSync(moneyDisplayPath), "Budget money display helpers should exist");

const budgetPageSource = readFileSync(budgetPagePath, "utf8");
const workspaceGroupSource = readFileSync(workspaceGroupPath, "utf8");
const moneyDisplaySource = readFileSync(moneyDisplayPath, "utf8");

assert.match(
  budgetPageSource,
  /from "\.\.\/features\/budget\/BudgetWorkspaceGroup"/,
  "BudgetPage should use the extracted budget workspace group component",
);
assert.doesNotMatch(
  budgetPageSource,
  /function BudgetCategoryRow/,
  "Budget category row rendering should no longer live in BudgetPage",
);
assert.doesNotMatch(
  budgetPageSource,
  /function EditableAssignedCell/,
  "Assigned-cell editing should no longer live in BudgetPage",
);
assert.doesNotMatch(
  budgetPageSource,
  /function BudgetGroup/,
  "Budget group rendering should no longer live in BudgetPage",
);

assert.match(
  workspaceGroupSource,
  /export function BudgetGroup/,
  "BudgetWorkspaceGroup should export the budget group renderer",
);
assert.match(
  workspaceGroupSource,
  /function BudgetCategoryRow/,
  "BudgetWorkspaceGroup should own budget category row rendering",
);
assert.match(
  workspaceGroupSource,
  /function EditableAssignedCell/,
  "BudgetWorkspaceGroup should own assigned-cell editing",
);
assert.match(
  workspaceGroupSource,
  /export function getCategorySortableId/,
  "BudgetWorkspaceGroup should export category sortable id helpers",
);
assert.match(
  workspaceGroupSource,
  /export function getGroupSortableId/,
  "BudgetWorkspaceGroup should export group sortable id helpers",
);

assert.match(
  moneyDisplaySource,
  /export function formatMoney/,
  "Shared budget money formatter should be exported",
);
assert.match(
  moneyDisplaySource,
  /export function getAvailableClass/,
  "Shared available-status class helper should be exported",
);

console.log("v2.60.1 budget workspace group extraction checks passed");
