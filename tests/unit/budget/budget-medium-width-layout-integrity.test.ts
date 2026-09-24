import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const responsive = readFileSync("apps/web/src/styles/budgetWorkspace.css", "utf8");

test("medium-width budget rules live with the Budget workspace owner", () => {
  assert.match(responsive, /\.budget-workspace-main\s*\{[\s\S]*container-name:\s*budget-workspace-main/);
});

test("medium-width budget keeps month title above the planning summary", () => {
  assert.match(
    responsive,
    /\.budget-planning-header\s*\{[\s\S]*grid-template-areas:[\s\S]*"months"[\s\S]*"title"[\s\S]*"summary"[\s\S]*"tabs"[\s\S]*"toolbar"/,
  );
});

test("budget planning cards stay side by side until the workspace is genuinely narrow", () => {
  assert.match(
    responsive,
    /\.budget-planning-summary-stack\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(15rem, 18rem\)/,
  );
  assert.match(
    responsive,
    /@container budget-workspace-main \(max-width: 33\.99rem\)[\s\S]*\.budget-planning-summary-stack\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/,
  );
  assert.doesNotMatch(
    responsive,
    /@container budget-workspace-main \(min-width: 34rem\) and \(max-width: 44rem\)[\s\S]*\.budget-planning-summary-stack\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/,
  );
});

test("medium-width budget compacts all four financial columns without changing phone rules", () => {
  assert.match(
    responsive,
    /@container budget-workspace-main \(min-width: 34rem\) and \(max-width: 64rem\)[\s\S]*grid-template-columns:[\s\S]*minmax\(13rem, 1fr\)[\s\S]*minmax\(5\.75rem, 6\.5rem\)[\s\S]*minmax\(5\.75rem, 6\.5rem\)[\s\S]*minmax\(5\.75rem, 6\.5rem\)/,
  );
  assert.match(responsive, /@media \(max-width: 600px\)/);
  assert.doesNotMatch(responsive, /!important/);
});
