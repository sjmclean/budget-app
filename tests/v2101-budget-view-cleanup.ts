import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const budgetPageSource = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.doesNotMatch(
  budgetPageSource,
  /ColumnVisibilityMenu/,
  "Budget should not import or render the shared column visibility menu.",
);
assert.doesNotMatch(
  budgetPageSource,
  /canHide:\s*true/,
  "Budget columns should be mandatory and should not be hideable.",
);
assert.match(
  budgetPageSource,
  /const BUDGET_COLUMN_DEFINITIONS:[\s\S]*id: "category"[\s\S]*id: "assigned"[\s\S]*id: "activity"[\s\S]*id: "available"/,
  "Budget should keep all core budget columns defined in the shared table layout.",
);
assert.match(
  budgetPageSource,
  /ColumnResizeHandle/,
  "Budget should keep shared column resizing after removing the View menu.",
);
assert.match(
  budgetPageSource,
  /useTableLayout/,
  "Budget should keep shared table layout for widths and row styles.",
);
assert.match(
  budgetPageSource,
  /budgetTableLayout\.visibleColumns\.map/,
  "Budget headers should still render from the shared table layout column list.",
);
assert.equal(
  packageJson.scripts["test:v2101:budget-view-cleanup"],
  "tsx tests/v2101-budget-view-cleanup.ts",
  "package.json should expose the v2.10.1 budget view cleanup test.",
);
assert.equal(
  packageJson.scripts["test:v2101"],
  "pnpm test:v2101:budget-view-cleanup",
  "package.json should expose the v2.10.1 aggregate test.",
);

console.log("v2.10.1 budget view cleanup regression checks passed");
