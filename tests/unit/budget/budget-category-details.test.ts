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


test("Budget keeps a permanent desktop Category Details column with an empty state", () => {
  assert.match(
    budgetPage,
    /"budget-workspace-layout-details-open"/,
  );
  assert.match(
    budgetPage,
    /function BudgetCategoryDetailsEmptyState\(\)[\s\S]*<h2>Category Details<\/h2>[\s\S]*Select a category/,
  );
  assert.match(
    budgetPage,
    /visibleSelectedCategory && visibleSelectedGroup \? \([\s\S]*<CategoryDetailsPanel[\s\S]*\) : \([\s\S]*<BudgetCategoryDetailsEmptyState \/>/,
  );
  assert.match(
    budgetCss,
    /@media \(max-width: 1024px\)[\s\S]*\.budget-category-details-panel-empty\s*\{[\s\S]*display:\s*none/,
  );
});

test("visible month capacity measures the already-reserved Budget workspace width", () => {
  assert.match(
    budgetPage,
    /const availableWorkspaceWidth = workspace\.getBoundingClientRect\(\)\.width/,
  );
  assert.match(
    budgetPage,
    /const observer = new ResizeObserver\(updateCapacity\)[\s\S]*observer\.observe\(workspace\)[\s\S]*observer\.observe\(layout\)/,
  );
  assert.match(
    budgetPage,
    /visibleBudgetMonthCapacity\(availableWorkspaceWidth\)/,
  );
  assert.doesNotMatch(
    budgetPage,
    /layoutWidth - inspectorWidth/,
  );
});


test("permanent Budget inspector shows health above table-aligned Category Details", () => {
  assert.match(
    budgetPage,
    /function BudgetHealthCard\([\s\S]*budget-health-summary[\s\S]*categories overspent[\s\S]*Future funding/,
  );
  assert.match(
    budgetPage,
    /overspentCategories = data[\s\S]*category\.isOverspent[\s\S]*Math\.abs\(category\.available\)/,
  );
  assert.match(
    budgetPage,
    /nextMonthStatus=[\s\S]*nextMonthBudget\.error[\s\S]*nextMonthOutlook\?\.status/,
  );
  assert.match(
    budgetPage,
    /futureOvercommitment=\{futureOvercommitment\}/,
  );
  assert.match(
    budgetPage,
    /budgetHealthAnchorRef\.current[\s\S]*budgetCategoryAnchorRef\.current/,
  );
  assert.match(
    budgetPage,
    /healthAnchor\.getBoundingClientRect\(\)\.top - layoutTop[\s\S]*categoryAnchor\.getBoundingClientRect\(\)\.top - layoutTop/,
  );
  assert.match(
    budgetPage,
    /--budget-inspector-category-offset/,
  );
  assert.match(
    budgetCss,
    /\.budget-health-card\s*\{[\s\S]*position:\s*absolute/,
  );
  assert.match(
    budgetCss,
    /\.budget-inspector-category-slot\s*\{[\s\S]*position:\s*absolute[\s\S]*var\(--budget-inspector-category-offset/,
  );
});
