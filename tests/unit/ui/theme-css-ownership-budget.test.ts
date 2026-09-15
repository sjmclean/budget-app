import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const budgetPage = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");
const main = readFileSync("apps/web/src/main.tsx", "utf8");
const budget = readFileSync("apps/web/src/styles/budgetWorkspace.css", "utf8");
const globals = readFileSync("apps/web/src/styles/globals.css", "utf8");

function rule(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? "";
}

test("BudgetPage directly owns the semantic Budget workspace stylesheet", () => {
  assert.match(budgetPage, /import\s+"\.\.\/styles\/budgetWorkspace\.css"/);
  assert.doesNotMatch(main, /budgetWorkspace\.css/);
});

test("the global dark repair layer is retired without replacement Budget dark selectors", () => {
  assert.equal(existsSync("apps/web/src/styles/darkThemePolish.css"), false);
  assert.doesNotMatch(main, /darkThemePolish/);
  assert.doesNotMatch(budget, /\[data-theme=["']dark["']\]/);

  const activeSource = readdirSync("apps/web/src", { recursive: true })
    .filter((path) => typeof path === "string" && /\.(?:css|tsx?)$/.test(path))
    .map((path) => readFileSync(`apps/web/src/${path}`, "utf8"))
    .join("\n");
  assert.doesNotMatch(activeSource, /\[data-theme=["']dark["']\][^{]*\.budget-/);
});

test("representative live Budget theme families reside in the Budget owner", () => {
  for (const selector of [
    ".budget-workspace-table-card",
    ".budget-workspace-table-head",
    ".budget-workspace-group-header",
    ".budget-workspace-row",
    ".activity-drilldown-button",
    ".available-pill",
    ".available-pill-positive",
    ".available-pill-negative",
    ".available-pill-zero",
    ".available-pill-warning",
    ".budget-ready-summary-positive",
    ".budget-ready-summary-negative",
    ".budget-ready-summary-neutral",
  ]) {
    assert.match(budget, new RegExp(`\\${selector}\\b`));
  }
});

test("Budget financial states use canonical semantic tokens", () => {
  const positive = rule(budget, ".available-pill-positive");
  const negative = rule(budget, ".available-pill-negative");
  const warning = rule(budget, ".available-pill-warning");
  assert.match(positive, /var\(--positive\)/);
  assert.match(positive, /var\(--positive-bg\)/);
  assert.match(negative, /var\(--negative\)/);
  assert.match(negative, /var\(--negative-bg\)/);
  assert.match(warning, /var\(--warning\)/);
  assert.match(warning, /var\(--warning-text\)/);
  assert.match(warning, /var\(--warning-bg\)/);
  assert.match(budget, /budget-ready-summary-positive[\s\S]*color:\s*var\(--positive\)/);
  assert.match(budget, /budget-ready-summary-negative[\s\S]*color:\s*var\(--negative\)/);
  assert.match(budget, /budget-ready-summary-neutral[\s\S]*color:\s*var\(--text\)/);
});

test("Budget owner contains no fixed Light palette or canonical-token fallbacks", () => {
  assert.doesNotMatch(
    budget,
    /rgba\((?:255,\s*255,\s*255|220,\s*38,\s*38),|#(?:fff(?:fff)?|15803d|dcfce7|dc2626|fee2e2|64748b|0f172a)\b/i,
  );
  assert.doesNotMatch(
    budget,
    /var\(--(?:surface|surface-subtle|text|text-muted|border|border-soft|accent|positive|positive-bg|negative|negative-bg),/,
  );
});

test("Blueprint and responsive ownership remain intentionally staged", () => {
  assert.match(globals, /:root\[data-theme="blueprint"\] \.budget-workspace-table-card/);
  assert.match(globals, /:root\[data-theme="blueprint"\] \.budget-workspace-group-header/);
  assert.equal(existsSync("apps/web/src/styles/budgetResponsivePolish.css"), true);
});

test("dead Ready-to-Assign pill aliases are not carried into the new owner", () => {
  assert.doesNotMatch(budgetPage, /ready-to-assign-pill|ready-to-assign-negative/);
  assert.doesNotMatch(budget, /ready-to-assign-pill|ready-to-assign-negative/);
  assert.doesNotMatch(globals, /ready-to-assign-pill|ready-to-assign-negative/);
});
