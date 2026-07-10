import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspaceGroup = readFileSync(
  "apps/web/src/features/budget/BudgetWorkspaceGroup.tsx",
  "utf8",
);
const coverMenu = readFileSync(
  "apps/web/src/features/budget/BudgetCoverOverspendingMenu.tsx",
  "utf8",
);
const coverStyles = readFileSync(
  "apps/web/src/styles/budgetCoverOverspending.css",
  "utf8",
);
const main = readFileSync("apps/web/src/main.tsx", "utf8");

assert.doesNotMatch(
  workspaceGroup,
  /budget-cover-overspending-trigger/,
  "Budget rows should no longer render a separate cover overspending icon button.",
);
assert.doesNotMatch(
  workspaceGroup,
  /ArrowRightLeft/,
  "Budget row trigger should not retain the obsolete transfer icon import.",
);
assert.match(
  workspaceGroup,
  /budget-available-cover-button/,
  "Negative Available amounts should use the cover overspending button styling.",
);
assert.match(
  workspaceGroup,
  /\{canCoverOverspending \? \(\s*<button/s,
  "Only categories that can cover overspending should render Available as a button.",
);
assert.match(
  workspaceGroup,
  /onOpenCoverOverspending\?\.\(event\)/,
  "Clicking the negative Available amount should open the existing cover menu callback.",
);
assert.match(
  workspaceGroup,
  /\) : \(\s*<strong/s,
  "Positive and zero Available amounts should remain non-interactive strong elements.",
);
assert.match(
  coverMenu,
  /function groupCoverOptions/,
  "Cover options should be grouped by category group.",
);
assert.match(
  coverMenu,
  /groupByName = new Map/,
  "Grouped options should preserve their first-seen budget order.",
);
assert.match(
  coverMenu,
  /budget-cover-source-group-heading/,
  "Each category group should render one visible heading.",
);
assert.doesNotMatch(
  coverMenu,
  /icon=\{ArrowRightLeft\}/,
  "Source category rows should not repeat transfer icons.",
);
assert.match(
  coverMenu,
  /option\.id !== overspentCategory\.id/,
  "The overspent category should remain excluded from source options.",
);
assert.match(
  coverMenu,
  /option\.available > 0/,
  "Only categories with positive Available balances should be offered.",
);
assert.match(
  coverMenu,
  /onCoverOverspending\(\{\s*overspentCategoryId: overspentCategory\.id,\s*coveringCategoryId: option\.id,\s*amount,/s,
  "The existing cover command callback shape should remain unchanged.",
);
assert.match(
  coverStyles,
  /grid-template-columns: minmax\(0, 1fr\) auto/,
  "Source rows should separate category names and Available amounts into two columns.",
);
assert.match(
  coverStyles,
  /overflow-y: auto/,
  "Long source lists should scroll inside the popup.",
);
assert.match(
  coverStyles,
  /width: min\(28rem, calc\(100vw - 1rem\)\)/,
  "The popup should remain constrained to the viewport.",
);
assert.match(
  main,
  /budgetCoverOverspending\.css/,
  "The focused cover overspending styles should be loaded by the app.",
);

console.log("v2.86 cover overspending picker UX checks passed");
