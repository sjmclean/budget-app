import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const patch = readFileSync(
  "patches/v278-wire-budget-page-context-menu.patch",
  "utf8",
);
const groupComponent = readFileSync(
  "apps/web/src/features/budget/BudgetWorkspaceGroup.tsx",
  "utf8",
);
const contextMenu = readFileSync(
  "apps/web/src/features/budget/BudgetCategoryContextMenu.tsx",
  "utf8",
);

assert.match(
  patch,
  /BudgetCategoryContextMenu/,
  "v278 patch should import and render the budget category context menu.",
);
assert.match(
  patch,
  /resolveFloatingPositionFromMouseEvent/,
  "v278 patch should use the shared floating positioning helper.",
);
assert.match(
  patch,
  /type FloatingPosition/,
  "v278 patch should type the menu position using the shared floating UI type.",
);
assert.match(
  patch,
  /type MouseEvent/,
  "v278 patch should type the row context-menu event.",
);
assert.match(
  patch,
  /budgetContextMenu/,
  "v278 patch should add page-owned context menu state.",
);
assert.match(
  patch,
  /function closeBudgetContextMenu/,
  "v278 patch should provide a close handler for the page-owned menu.",
);
assert.match(
  patch,
  /function openBudgetContextMenu/,
  "v278 patch should provide an open handler for row context-menu events.",
);
assert.match(
  patch,
  /event\.nativeEvent/,
  "v278 patch should position the menu from the native mouse event.",
);
assert.match(
  patch,
  /viewport: \{ width: window\.innerWidth, height: window\.innerHeight \}/,
  "v278 patch should provide viewport dimensions to the shared positioner.",
);
assert.match(
  patch,
  /onOpenCategoryContextMenu=\{openBudgetContextMenu\}/,
  "v278 patch should wire BudgetGroup rows to the page-level open handler.",
);
assert.match(
  patch,
  /onOpenActivity=\{openActivityDrilldown\}/,
  "v278 patch should keep activity actions wired to the existing drilldown handler.",
);
assert.match(
  patch,
  /onOpenManageCategory=\{openCategoryEditor\}/,
  "v278 patch should keep manage actions wired to the existing category editor workflow.",
);
assert.match(
  patch,
  /onSetCategoryArchived=\{setCategoryArchived\}/,
  "v278 patch should keep archive actions wired to the existing archive workflow.",
);
assert.match(
  groupComponent,
  /onOpenCategoryContextMenu\?: \(input: \{/,
  "BudgetGroup should expose the right-click payload required by the page patch.",
);
assert.match(
  contextMenu,
  /BudgetCategoryContextMenu/,
  "BudgetCategoryContextMenu should exist for the page patch to render.",
);

console.log("v2.78 budget context menu page wiring patch checks passed");
