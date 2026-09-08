import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const main = readFileSync("apps/web/src/main.tsx", "utf8");
const responsive = readFileSync(
  "apps/web/src/styles/budgetResponsivePolish.css",
  "utf8",
);

test("medium-width budget polish is loaded after the base stylesheet", () => {
  assert.match(
    main,
    /styles\/globals\.css[\s\S]*styles\/budgetResponsivePolish\.css/,
  );
});

test("medium-width budget keeps the summary beside the planning header", () => {
  assert.match(
    responsive,
    /@container budget-workspace-main \(min-width: 34rem\) and \(max-width: 44rem\)[\s\S]*grid-template-areas:[\s\S]*"title summary"[\s\S]*"month summary"[\s\S]*"tabs summary"/,
  );
  assert.match(responsive, /budget-ready-summary[\s\S]*width: min\(16rem, 100%\)/);
});

test("medium-width budget compacts all four financial columns without changing phone rules", () => {
  assert.match(
    responsive,
    /@container budget-workspace-main \(min-width: 34rem\) and \(max-width: 64rem\)[\s\S]*grid-template-columns:[\s\S]*minmax\(13rem, 1fr\)[\s\S]*minmax\(5\.75rem, 6\.5rem\)[\s\S]*minmax\(5\.75rem, 6\.5rem\)[\s\S]*minmax\(5\.75rem, 6\.5rem\)/,
  );
  assert.doesNotMatch(responsive, /@media \(max-width: 600px\)/);
});
