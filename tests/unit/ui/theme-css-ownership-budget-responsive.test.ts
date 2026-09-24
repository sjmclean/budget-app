import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const budgetPage = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");
const budgetGroup = readFileSync(
  "apps/web/src/features/budget/BudgetWorkspaceGroup.tsx",
  "utf8",
);
const budget = readFileSync("apps/web/src/styles/budgetWorkspace.css", "utf8");
const globals = readFileSync("apps/web/src/styles/globals.css", "utf8");
const main = readFileSync("apps/web/src/main.tsx", "utf8");

test("BudgetPage owns responsive Budget CSS without a global repair layer", () => {
  assert.match(budgetPage, /import\s+"\.\.\/styles\/budgetWorkspace\.css"/);
  assert.doesNotMatch(main, /budget(?:Workspace|ResponsivePolish)\.css/);
  assert.equal(existsSync("apps/web/src/styles/budgetResponsivePolish.css"), false);

  const source = readdirSync("apps/web/src", { recursive: true })
    .filter((path) => typeof path === "string" && /\.(?:css|tsx?)$/.test(path))
    .map((path) => readFileSync(`apps/web/src/${path}`, "utf8"))
    .join("\n");
  assert.doesNotMatch(source, /budgetResponsivePolish/);
});

test("Budget adapts table layout values into typed feature custom properties", () => {
  assert.match(budgetPage, /const budgetGridStyle:\s*BudgetGridStyle/);
  assert.match(budgetPage, /"--budget-grid-template-columns"/);
  assert.match(budgetPage, /"--budget-grid-min-width"/);
  assert.match(budgetPage, /"--budget-grid-width"/);
  assert.doesNotMatch(budgetPage, /style=\{budgetTableLayout\.rowStyle\}/);
  assert.doesNotMatch(budgetPage, /rowStyle=\{budgetTableLayout\.rowStyle\}/);
  assert.doesNotMatch(budgetGroup, /style=\{rowStyle\}/);
  assert.doesNotMatch(budgetGroup, /\browStyle:\s*CSSProperties/);
  assert.match(budgetGroup, /style=\{gridStyle\}/);
});

test("Budget owner consumes dynamic layout variables for the aligned grid family", () => {
  assert.match(
    budget,
    /\.budget-workspace-table-head,[\s\S]*\.budget-workspace-group-header,[\s\S]*\.budget-workspace-row\s*\{[\s\S]*width:\s*var\(--budget-grid-width,[\s\S]*min-width:\s*var\(--budget-grid-min-width,[\s\S]*grid-template-columns:\s*var\([\s\S]*--budget-grid-template-columns/,
  );
});

test("Budget owner contains medium, intermediate, and narrow responsive layouts", () => {
  assert.match(
    budget,
    /\.budget-planning-header\s*\{[\s\S]*grid-template-areas:[\s\S]*"months"[\s\S]*"title"[\s\S]*"summary"[\s\S]*"tabs"[\s\S]*"toolbar"/,
  );
  assert.match(
    budget,
    /@container budget-workspace-main \(max-width: 33\.99rem\)[\s\S]*\.budget-planning-summary-stack\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/,
  );
  assert.match(
    budget,
    /@container budget-workspace-main \(min-width: 34rem\) and \(max-width: 64rem\)[\s\S]*minmax\(13rem, 1fr\)[\s\S]*minmax\(5\.75rem, 6\.5rem\)/,
  );
  assert.match(
    budget,
    /@media \(max-width: 600px\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(5\.8rem, auto\)[\s\S]*\.budget-column-assigned,[\s\S]*display:\s*none/,
  );
});

test("Budget responsive ownership no longer depends on specificity overrides", () => {
  assert.doesNotMatch(budget, /!important/);
  assert.doesNotMatch(
    globals,
    /(?:budget-workspace-table-head|budget-workspace-group-header|budget-workspace-row)[^{]*\{[^}]*!important/,
  );
  assert.doesNotMatch(globals, /@container budget-workspace-main/);
});

test("Blueprint no longer targets Budget responsive feature selectors globally", () => {
  assert.doesNotMatch(globals, /:root\[data-theme=["']blueprint["']\][^{]*\.budget-/);
});
