import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(
  "scripts/apply-v278-budget-context-menu-page-wiring.mjs",
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
  script,
  /BudgetCategoryContextMenu/,
  "v278 script should import and render the budget category context menu.",
);
assert.match(
  script,
  /resolveFloatingPositionFromMouseEvent/,
  "v278 script should use the shared floating positioning helper.",
);
assert.match(
  script,
  /type FloatingPosition/,
  "v278 script should type the menu position using the shared floating UI type.",
);
assert.match(
  script,
  /type MouseEvent/,
  "v278 script should type the row context-menu event.",
);
assert.match(
  script,
  /budgetContextMenu/,
  "v278 script should add page-owned context menu state.",
);
assert.match(
  script,
  /function closeBudgetContextMenu/,
  "v278 script should provide a close handler for the page-owned menu.",
);
assert.match(
  script,
  /function openBudgetContextMenu/,
  "v278 script should provide an open handler for row context-menu events.",
);
assert.match(
  script,
  /event\.nativeEvent/,
  "v278 script should position the menu from the native mouse event.",
);
assert.match(
  script,
  /viewport: \{ width: window\.innerWidth, height: window\.innerHeight \}/,
  "v278 script should provide viewport dimensions to the shared positioner.",
);
assert.match(
  script,
  /onOpenCategoryContextMenu=\{openBudgetContextMenu\}/,
  "v278 script should wire BudgetGroup rows to the page-level open handler.",
);
assert.match(
  script,
  /onOpenActivity=\{openActivityDrilldown\}/,
  "v278 script should keep activity actions wired to the existing drilldown handler.",
);
assert.match(
  script,
  /onOpenManageCategory=\{openCategoryEditor\}/,
  "v278 script should keep manage actions wired to the existing category editor workflow.",
);
assert.match(
  script,
  /onSetCategoryArchived=\{setCategoryArchived\}/,
  "v278 script should keep archive actions wired to the existing archive workflow.",
);
assert.match(
  groupComponent,
  /onOpenCategoryContextMenu\?: \(input: \{/,
  "BudgetGroup should expose the right-click payload required by the page script.",
);
assert.match(
  contextMenu,
  /BudgetCategoryContextMenu/,
  "BudgetCategoryContextMenu should exist for the page script to render.",
);

console.log("v2.78 budget context menu page wiring script checks passed");
