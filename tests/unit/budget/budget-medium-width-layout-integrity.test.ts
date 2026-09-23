import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const responsive = readFileSync("apps/web/src/styles/budgetWorkspace.css", "utf8");

test("medium-width budget rules live with the Budget workspace owner", () => {
  assert.match(responsive, /\.budget-workspace-main\s*\{[\s\S]*container-name:\s*budget-workspace-main/);
});

test("medium-width budget keeps the month strip above the planning summary", () => {
  assert.match(
    responsive,
    /@container budget-workspace-main \(min-width: 34rem\) and \(max-width: 44rem\)[\s\S]*grid-template-areas:[\s\S]*"months months"[\s\S]*"title summary"[\s\S]*"tabs summary"/,
  );
  assert.match(responsive, /budget-planning-summary-stack[\s\S]*width: min\(16rem, 100%\)/);
});

test("medium-width budget compacts all four financial columns without changing phone rules", () => {
  assert.match(
    responsive,
    /@container budget-workspace-main \(min-width: 34rem\) and \(max-width: 64rem\)[\s\S]*grid-template-columns:[\s\S]*minmax\(13rem, 1fr\)[\s\S]*minmax\(5\.75rem, 6\.5rem\)[\s\S]*minmax\(5\.75rem, 6\.5rem\)[\s\S]*minmax\(5\.75rem, 6\.5rem\)/,
  );
  assert.match(responsive, /@media \(max-width: 600px\)/);
  assert.doesNotMatch(responsive, /!important/);
});
