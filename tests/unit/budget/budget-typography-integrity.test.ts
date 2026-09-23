import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const budgetCss = readFileSync(
  new URL("../../../apps/web/src/styles/budgetWorkspace.css", import.meta.url),
  "utf8",
);

test("Budget typography uses the existing app font stack with bounded workspace refinements", () => {
  assert.match(
    budgetCss,
    /\.budget-workspace-screen\s*\{[\s\S]*font-kerning:\s*normal;[\s\S]*font-feature-settings:\s*"kern" 1, "tnum" 1;[\s\S]*font-variant-numeric:\s*tabular-nums;/,
  );
  assert.match(
    budgetCss,
    /\.budget-planning-title h1\s*\{[\s\S]*font-weight:\s*700;[\s\S]*letter-spacing:\s*-0\.02em;/,
  );
  assert.match(
    budgetCss,
    /\.budget-category-name\s*\{[\s\S]*font-weight:\s*650;[\s\S]*letter-spacing:\s*-0\.008em;/,
  );
  assert.match(
    budgetCss,
    /\.assigned-button,[\s\S]*\.available-pill\s*\{[\s\S]*font-weight:\s*650;/,
  );
});

test("Budget typography polish does not introduce a new webfont dependency", () => {
  assert.doesNotMatch(budgetCss, /@font-face/);
  assert.doesNotMatch(budgetCss, /fonts\.googleapis\.com/);
});
