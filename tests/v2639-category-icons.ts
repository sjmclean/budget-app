import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const iconSource = readFileSync(
  "apps/web/src/features/icons/CategoryIcon.tsx",
  "utf8",
);
const registerInputSource = readFileSync(
  "apps/web/src/features/accounts/components/RegisterCategoryInput.tsx",
  "utf8",
);
const transactionRowSource = readFileSync(
  "apps/web/src/features/accounts/components/TransactionRow.tsx",
  "utf8",
);
const budgetGroupSource = readFileSync(
  "apps/web/src/features/budget/BudgetWorkspaceGroup.tsx",
  "utf8",
);
const spendingReportSource = readFileSync(
  "apps/web/src/pages/reports/reports/SpendingByCategoryReport.tsx",
  "utf8",
);
const styleSource = readFileSync("apps/web/src/styles/globals.css", "utf8");

assert.match(iconSource, /export function CategoryIcon/, "CategoryIcon should be exported from the shared icon module");
assert.match(iconSource, /export function CategoryLabel/, "CategoryLabel should be exported from the shared icon module");
assert.match(iconSource, /name\.includes\("transfer"\)/, "transfers should have a dedicated icon mapping");
assert.match(iconSource, /category-icon-\$\{icon\.color\}/, "category icons should render with semantic colour classes");

assert.match(registerInputSource, /<CategoryIcon categoryName=\{suggestion\.value\}/, "category picker options should show category icons");
assert.match(transactionRowSource, /<CategoryLabel categoryName=\{transaction\.category\}/, "register rows should show category labels with icons");
assert.match(budgetGroupSource, /<CategoryLabel categoryName=\{category\.name\}/, "budget categories should show category labels with icons");
assert.match(spendingReportSource, /<CategoryLabel categoryName=\{row\.categoryName\}/, "spending report rows should show category labels with icons");

assert.match(styleSource, /\.category-label-with-icon/, "category label icon layout styles should exist");
assert.match(styleSource, /\.category-icon-green/, "category icon colour styles should exist");

console.log("v2.63.9 category icon checks passed");
