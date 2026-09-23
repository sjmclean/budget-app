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

test("Budget only mounts Category Details when a category is selected", () => {
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

test("Category Details follows the focused reference mockup hierarchy", () => {
  assert.doesNotMatch(
    budgetPage,
    /CategoryDetailsTab|budget-category-details-tabs|CategoryGoalInspectorSection|budget-category-details-balance/,
  );
  assert.match(
    budgetPage,
    /<h2>Category Details<\/h2>[\s\S]*<h3>\{category\.name\}<\/h3>/,
  );
  assert.match(budgetPage, /budget-category-details-financials/);
  assert.match(budgetPage, />Assigned</);
  assert.match(budgetPage, />Activity</);
  assert.match(budgetPage, />Available</);
  assert.match(budgetPage, /budget-category-details-status-section/);
  assert.match(budgetPage, />Status</);
  assert.match(budgetPage, /budget-category-details-status-dot/);
  assert.match(budgetPage, /budget-category-details-notes/);
  assert.match(budgetPage, /Archive Category/);
  assert.match(budgetPage, /Manage Category…/);
});

test("Budget reclaims the permanent inspector width until details are open", () => {
  assert.match(
    budgetCss,
    /\.budget-workspace-layout\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/,
  );
  assert.match(
    budgetCss,
    /\.budget-workspace-layout-details-open\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) 18rem/,
  );
  assert.match(
    budgetCss,
    /\.budget-category-details-panel\s*\{[\s\S]*position:\s*sticky;[\s\S]*var\(--workspace-side-panel-background\)/,
  );
});
