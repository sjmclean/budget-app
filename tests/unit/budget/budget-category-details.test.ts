import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const budgetPage = readFileSync(
  new URL("../../../apps/web/src/pages/BudgetPage.tsx", import.meta.url),
  "utf8",
);
const budgetCss = readFileSync(
  new URL("../../../apps/web/src/styles/budgetWorkspace.css", import.meta.url),
  "utf8",
);

test("Budget mounts Category Details whenever a category is selected", () => {
  assert.doesNotMatch(budgetPage, /<aside className="budget-month-panel"/);
  assert.doesNotMatch(budgetPage, /Budget Health/);
  assert.match(
    budgetPage,
    /visibleSelectedCategory && visibleSelectedGroup \? \([\s\S]*<CategoryDetailsPanel/,
  );
  assert.match(
    budgetPage,
    /onClose=\{clearSelection\}/,
  );
});

test("Category Details follows the rich reference mockup hierarchy", () => {
  assert.match(
    budgetPage,
    /type CategoryDetailsTab = "overview" \| "goal" \| "activity" \| "notes"/,
  );
  assert.match(
    budgetPage,
    /<h2>Category Details<\/h2>[\s\S]*<h3>\{category\.name\}<\/h3>/,
  );
  assert.match(budgetPage, /budget-category-details-tabs/);
  assert.match(budgetPage, /"overview", "goal", "activity", "notes"/);
  assert.match(budgetPage, /budget-category-details-summary-card/);
  assert.match(budgetPage, />Available</);
  assert.match(budgetPage, />Assigned</);
  assert.match(budgetPage, />Activity</);
  assert.match(budgetPage, /budget-category-details-goal-summary/);
  assert.match(budgetPage, /Funding progress/);
  assert.match(budgetPage, /Recent activity/);
  assert.match(budgetPage, /View all activity/);
  assert.match(budgetPage, /Cover Overspending/);
  assert.match(budgetPage, /Move Money/);
  assert.match(
    budgetPage,
    /onClick=\{\(\) => onOpenMoveMoney\(category\.id\)\}[\s\S]*Move Money/,
  );
  assert.doesNotMatch(
    budgetPage,
    /Move Money is not yet available from Category Details/,
  );
  assert.match(budgetPage, /Money movements/);
  assert.match(
    budgetPage,
    /movementHistory=\{selectedCategoryMovementHistory\}/,
  );
  assert.match(
    budgetPage,
    /<BudgetMoveMoneyDialog[\s\S]*onMoveMoney=\{\(input\) => \{[\s\S]*moveMoney\(input\)/,
  );
  assert.match(budgetPage, /Edit Goal|Set Goal/);
  assert.match(budgetPage, /<CategoryGoalInspectorSection/);
});

test("Budget keeps Category Details adjacent to the bounded working surface", () => {
  assert.match(
    budgetCss,
    /\.budget-workspace-layout\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/,
  );
  assert.match(
    budgetCss,
    /\.budget-workspace-layout-details-open\s*\{[\s\S]*grid-template-columns:[\s\S]*minmax\(0, var\(--budget-working-max-width\)\)[\s\S]*minmax\(19rem, 20\.5rem\)/,
  );
  assert.match(
    budgetCss,
    /\.budget-category-details-panel\s*\{[\s\S]*position:\s*sticky;[\s\S]*var\(--workspace-side-panel-background\)/,
  );
});


test("multi-month Budget promotes the clicked month and opens its category inspector", () => {
  assert.match(
    budgetPage,
    /function selectVisibleMonthCategory\(month: string, categoryId: string\)[\s\S]*selectCategory\(categoryId\)[\s\S]*month !== selectedMonth[\s\S]*setSelectedMonth\(month\)/,
  );
  assert.match(
    budgetPage,
    /<BudgetMultiMonthPane[\s\S]*onSelectCategory=\{selectVisibleMonthCategory\}/,
  );
  assert.match(
    budgetPage,
    /<BudgetFutureMonthPane[\s\S]*onSelectCategory=\{selectVisibleMonthCategory\}/,
  );
  assert.match(
    budgetCss,
    /\.budget-workspace-screen-multi-month\.budget-workspace-layout-details-open\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(19rem, 20\.5rem\)/,
  );
});
