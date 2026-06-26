import { readFileSync } from "node:fs";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const tableLayout = readFileSync(
  "apps/web/src/features/tableLayout/tableLayout.ts",
  "utf8",
);
const columnMenu = readFileSync(
  "apps/web/src/features/tableLayout/ColumnVisibilityMenu.tsx",
  "utf8",
);
const budgetPage = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");
const packageJson = readFileSync("package.json", "utf8");

[
  "TableColumnDefinition",
  "useTableLayout",
  "readVisibleTableColumns",
  "writeVisibleTableColumns",
  "buildTableRowStyle",
].forEach((marker) => {
  assert(tableLayout.includes(marker), `Expected shared table layout marker ${marker}.`);
});

[
  "ColumnVisibilityMenu",
  "table-layout-menu-panel",
  "Reset layout",
].forEach((marker) => {
  assert(columnMenu.includes(marker), `Expected column menu marker ${marker}.`);
});

[
  "BUDGET_TABLE_LAYOUT_STORAGE_KEY_PREFIX",
  "BUDGET_COLUMN_DEFINITIONS",
  "useTableLayout",
  "budgetTableLayout.rowStyle",
  "isBudgetColumnVisible",
].forEach((marker) => {
  assert(budgetPage.includes(marker), `Expected BudgetPage.tsx marker ${marker}.`);
});

["assigned", "activity"].forEach((column) => {
  assert(budgetPage.includes(`id: "${column}"`), `Expected mandatory budget column ${column}.`);
});
assert(!budgetPage.includes("canHide: true"), "Budget core columns should not be hideable.");

assert(packageJson.includes("test:v204"), "Expected package.json to include test:v204.");

console.log("v2.04 shared table layout checks passed");
