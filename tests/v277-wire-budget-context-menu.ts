import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const groupComponent = readFileSync(
  "apps/web/src/features/budget/BudgetWorkspaceGroup.tsx",
  "utf8",
);
const menuComponent = readFileSync(
  "apps/web/src/features/budget/BudgetCategoryContextMenu.tsx",
  "utf8",
);

assert.match(
  groupComponent,
  /type MouseEvent/,
  "Budget workspace rows should type context-menu events.",
);
assert.match(
  groupComponent,
  /onOpenCategoryContextMenu\?: \(event: MouseEvent<HTMLElement>\) => void/,
  "Budget category rows should accept an optional context-menu callback.",
);
assert.match(
  groupComponent,
  /onContextMenu=\{\(event\) => \{/,
  "Budget category rows should handle right-click context-menu events.",
);
assert.match(
  groupComponent,
  /event\.preventDefault\(\)/,
  "Budget category row context menus should suppress the browser menu.",
);
assert.match(
  groupComponent,
  /event\.stopPropagation\(\)/,
  "Budget category row context menus should avoid leaking to drag or parent handlers.",
);
assert.match(
  groupComponent,
  /onSelect\(\);\s*onOpenCategoryContextMenu\(event\);/,
  "Budget category row context menus should select the row before opening menu actions.",
);
assert.match(
  groupComponent,
  /onOpenCategoryContextMenu\?: \(input: \{/,
  "BudgetGroup should expose category and group context-menu details to pages.",
);
assert.match(
  groupComponent,
  /category: BudgetCategoryView;/,
  "BudgetGroup context-menu payload should include the clicked category.",
);
assert.match(
  groupComponent,
  /group: BudgetCategoryGroupView;/,
  "BudgetGroup context-menu payload should include the owning group.",
);
assert.match(
  groupComponent,
  /onOpenCategoryContextMenu\(\{\s*event,\s*category,\s*group,/s,
  "BudgetGroup should forward event, category, and group to the page-level menu owner.",
);
assert.match(
  menuComponent,
  /BudgetCategoryContextMenu/,
  "Budget category context menu component should exist for the row wiring to target.",
);

console.log("v2.77 budget context menu row wiring checks passed");
