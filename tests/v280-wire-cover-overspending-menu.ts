import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const contextMenu = readFileSync(
  "apps/web/src/features/budget/BudgetCategoryContextMenu.tsx",
  "utf8",
);
const script = readFileSync(
  "scripts/apply-v280-cover-overspending-menu-wiring.mjs",
  "utf8",
);
const coverMenu = readFileSync(
  "apps/web/src/features/budget/BudgetCoverOverspendingMenu.tsx",
  "utf8",
);

assert.match(
  contextMenu,
  /ArrowRightLeft/,
  "Budget context menu should include the cover overspending icon.",
);
assert.match(
  contextMenu,
  /onOpenCoverOverspending: \(categoryId: string\) => void/,
  "Budget context menu should expose a cover overspending action callback.",
);
assert.match(
  contextMenu,
  /isMoneyNegative\(category\.available\) && !isManagedCategory/,
  "Budget context menu should only enable cover action for editable overspent categories.",
);
assert.match(
  contextMenu,
  /Cover overspending from…/,
  "Budget context menu should display the cover overspending action.",
);
assert.match(
  contextMenu,
  /onOpenCoverOverspending\(category\.id\)/,
  "Budget context menu should invoke the cover overspending callback with the selected category.",
);
assert.match(
  script,
  /BudgetCoverOverspendingMenu/,
  "v280 script should import and render the cover overspending menu.",
);
assert.match(
  script,
  /coverOverspendingMenu/,
  "v280 script should add page-owned cover overspending menu state.",
);
assert.match(
  script,
  /function closeCoverOverspendingMenu/,
  "v280 script should add a cover menu close handler.",
);
assert.match(
  script,
  /function openCoverOverspendingMenu/,
  "v280 script should add a cover menu open handler.",
);
assert.match(
  script,
  /onOpenCoverOverspending=\{openCoverOverspendingMenu\}/,
  "v280 script should wire the context-menu action to the page owner.",
);
assert.match(
  script,
  /coverOptions=\{coverOptions\}/,
  "v280 script should pass existing cover options to the menu.",
);
assert.match(
  script,
  /currencyCode=\{data\.currencyCode\}/,
  "v280 script should pass the budget currency to the menu.",
);
assert.match(
  script,
  /coverOverspending\(input\)/,
  "v280 script should call the existing cover overspending command.",
);
assert.match(
  coverMenu,
  /onCoverOverspending/,
  "BudgetCoverOverspendingMenu should expose the cover command callback used by v280.",
);

console.log("v2.80 cover overspending wiring checks passed");
