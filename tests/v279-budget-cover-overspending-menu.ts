import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(
  "apps/web/src/features/budget/BudgetCoverOverspendingMenu.tsx",
  "utf8",
);

assert.match(
  component,
  /export function BudgetCoverOverspendingMenu/,
  "Budget cover overspending menu should be extracted as a reusable component.",
);
assert.match(
  component,
  /<FloatingMenu/,
  "Budget cover overspending menu should use the shared FloatingMenu component.",
);
assert.match(
  component,
  /FloatingMenuHeading/,
  "Budget cover overspending menu should use the shared floating menu heading.",
);
assert.match(
  component,
  /FloatingMenuList/,
  "Budget cover overspending menu should use the shared floating menu list.",
);
assert.match(
  component,
  /FloatingMenuItem/,
  "Budget cover overspending menu should use the shared floating menu item primitive.",
);
assert.match(
  component,
  /budget-cover-menu-layer floating-menu-layer/,
  "Budget cover overspending menu should keep a budget-specific layer hook while adopting shared layer styling.",
);
assert.match(
  component,
  /budget-cover-menu floating-menu-panel/,
  "Budget cover overspending menu should keep a budget-specific panel hook while adopting shared panel styling.",
);
assert.match(
  component,
  /function getOverspentAmount/,
  "Budget cover overspending menu should centralise overspent amount calculation.",
);
assert.match(
  component,
  /Math\.abs\(Math\.min\(0, category\.available\)\)/,
  "Budget cover overspending menu should calculate the absolute negative available amount.",
);
assert.match(
  component,
  /option\.id !== overspentCategory\.id/,
  "Budget cover overspending menu should exclude the overspent category from source options.",
);
assert.match(
  component,
  /option\.available > 0/,
  "Budget cover overspending menu should only show categories with available money.",
);
assert.match(
  component,
  /if \(!overspentCategory \|\| overspentAmount <= 0\)/,
  "Budget cover overspending menu should render nothing when the selected category is not overspent.",
);
assert.match(
  component,
  /Math\.min\(overspentAmount, option\.available\)/,
  "Budget cover overspending menu should cap the movement amount to the available source balance.",
);
assert.match(
  component,
  /onCoverOverspending\(\{\s*overspentCategoryId: overspentCategory\.id,\s*coveringCategoryId: option\.id,\s*amount,/s,
  "Budget cover overspending menu should call the existing cover overspending command shape.",
);
assert.match(
  component,
  /No other category currently has available money/,
  "Budget cover overspending menu should explain when no source categories are available.",
);

console.log("v2.79 budget cover overspending menu checks passed");
