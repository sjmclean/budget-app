import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const budgetPage = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");

function indexOfOrThrow(source: string, text: string): number {
  const index = source.indexOf(text);
  assert.notEqual(index, -1, `Expected to find ${text}`);
  return index;
}

function testBudgetDragDropHookRunsBeforeEarlyReturns() {
  const hookIndex = indexOfOrThrow(budgetPage, "const budgetDragDrop = useBudgetDragDrop");
  const loadingReturnIndex = indexOfOrThrow(budgetPage, "if (isLoading) {");
  const errorReturnIndex = indexOfOrThrow(budgetPage, "if (error || !data) {");

  assert.ok(
    hookIndex < loadingReturnIndex,
    "Budget drag/drop hook must be called before the loading early return to preserve hook order.",
  );
  assert.ok(
    hookIndex < errorReturnIndex,
    "Budget drag/drop hook must be called before the error early return to preserve hook order.",
  );
}

function testVisibleGroupsAreSafeBeforeDataLoads() {
  assert.match(
    budgetPage,
    /const visibleCategoryGroups = data[\s\S]*?getVisibleCategoryGroups\(data\.categoryGroups, hideArchivedCategories\)[\s\S]*?: \[\];/,
    "Visible category groups should be safe to compute before budget data has loaded.",
  );
}

function run() {
  testBudgetDragDropHookRunsBeforeEarlyReturns();
  testVisibleGroupsAreSafeBeforeDataLoads();
  console.log("v2.61.5 budget drag/drop hook order checks passed");
}

run();
