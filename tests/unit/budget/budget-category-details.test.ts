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

test("Category Details exposes the agreed desktop information sections", () => {
  assert.match(
    budgetPage,
    /type CategoryDetailsTab = "overview" \| "goal" \| "activity" \| "notes"/,
  );
  assert.match(budgetPage, />Overview</);
  assert.match(budgetPage, />Goal</);
  assert.match(budgetPage, />Activity</);
  assert.match(budgetPage, />Notes</);
  assert.match(budgetPage, /<CategoryGoalInspectorSection/);
  assert.match(budgetPage, /onOpenActivity\(category\.id\)/);
  assert.match(budgetPage, /onOpenSettings\(category\.id\)/);
});

test("Budget reclaims the permanent inspector width until details are open", () => {
  assert.match(
    budgetCss,
    /\.budget-workspace-layout\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/,
  );
  assert.match(
    budgetCss,
    /\.budget-workspace-layout-details-open\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(18rem, 20rem\)/,
  );
  assert.match(
    budgetCss,
    /\.budget-category-details-panel\s*\{[\s\S]*position:\s*sticky;[\s\S]*var\(--workspace-side-panel-background\)/,
  );
});
