import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(
  "apps/web/src/features/budget/BudgetCategoryContextMenu.tsx",
  "utf8",
);

assert.match(
  component,
  /export function BudgetCategoryContextMenu/,
  "Budget category context menu should be extracted as a reusable component.",
);
assert.match(
  component,
  /<FloatingMenu/,
  "Budget category context menu should use the shared FloatingMenu component.",
);
assert.match(
  component,
  /FloatingMenuHeading/,
  "Budget category context menu should use the shared floating menu heading.",
);
assert.match(
  component,
  /FloatingMenuItem/,
  "Budget category context menu should use the shared floating menu item primitive.",
);
assert.match(
  component,
  /FloatingMenuDivider/,
  "Budget category context menu should use the shared floating menu divider.",
);
assert.match(
  component,
  /budget-context-menu-layer floating-menu-layer/,
  "Budget category context menu should keep a budget-specific layer hook while adopting shared layer styling.",
);
assert.match(
  component,
  /budget-context-menu floating-menu-panel/,
  "Budget category context menu should keep a budget-specific panel hook while adopting shared panel styling.",
);
assert.match(
  component,
  /isCreditCardPaymentCategory/,
  "Budget category context menu should protect managed credit card payment categories.",
);
assert.match(
  component,
  /disabled=\{!hasActivity\}/,
  "Budget category context menu should disable activity drilldown when no activity exists.",
);
assert.match(
  component,
  /onOpenActivity\(category\.id\)/,
  "Budget category context menu should expose activity drilldown actions.",
);
assert.match(
  component,
  /onRenameCategory\(category\.id\)/,
  "Budget category context menu should expose rename actions.",
);
assert.match(
  component,
  /onOpenManageCategory\(category\.id\)/,
  "Budget category context menu should expose manage category actions.",
);
assert.match(
  component,
  /onSetCategoryArchived\(category\.id, !category\.isArchived\)/,
  "Budget category context menu should expose archive and restore actions.",
);
assert.match(
  component,
  /variant=\{category\.isArchived \? "success" : "danger"\}/,
  "Budget category context menu should use success for restore and danger for archive.",
);
assert.match(
  component,
  /if \(!category \|\| !group\)/,
  "Budget category context menu should render nothing without a selected category and group.",
);

console.log("v2.76 budget context menu checks passed");
