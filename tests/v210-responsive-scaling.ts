import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const globalsSource = readFileSync("apps/web/src/styles/globals.css", "utf8");
const registerStylesSource = readFileSync("apps/web/src/styles/register.css", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.match(
  globalsSource,
  /\.app-content \{[\s\S]*?min-width: 0;/,
  "App content should be allowed to shrink inside the viewport instead of forcing page-level horizontal overflow.",
);
assert.match(
  globalsSource,
  /\.main-content \{[\s\S]*?max-width: 100%;/,
  "Main content should be constrained to the viewport width.",
);
assert.match(
  globalsSource,
  /\.budget-workspace-table-card \{[\s\S]*?overflow-x: auto;[\s\S]*?overscroll-behavior-x: contain;/,
  "Budget table cards should own horizontal scrolling for wide/resized columns.",
);
assert.doesNotMatch(
  globalsSource,
  /@media \(max-width: 680px\) \{\s*\.budget-workspace-table-head \{\s*display: none;/,
  "Budget table headers should remain available on narrow viewports so resize and column context are not lost.",
);
assert.match(
  globalsSource,
  /v2\.10 shared responsive table containment/,
  "Global styles should document the shared responsive table containment pass.",
);
assert.match(
  globalsSource,
  /\.budget-workspace-table-card,\s*\.register-table \{[\s\S]*?scrollbar-gutter: stable;/,
  "Shared wide tables should reserve stable scrollbar gutter space.",
);

assert.match(
  registerStylesSource,
  /\.register-workspace \{[\s\S]*?min-width: 0;/,
  "Register workspace should be shrinkable inside the app shell.",
);
assert.match(
  registerStylesSource,
  /\.register-clean-header \{[\s\S]*?flex-wrap: wrap;/,
  "Register header should wrap instead of overflowing on narrow widths.",
);
assert.match(
  registerStylesSource,
  /\.register-toolbar-actions \{[\s\S]*?flex-wrap: wrap;/,
  "Register toolbar actions should wrap instead of hiding controls.",
);
assert.match(
  registerStylesSource,
  /\.register-search \{[\s\S]*?flex: 1 1 14rem;[\s\S]*?min-width: min\(14rem, 100%\);/,
  "Register search should shrink and wrap safely with toolbar controls.",
);
assert.match(
  registerStylesSource,
  /\.register-table \{[\s\S]*?max-width: 100%;[\s\S]*?overflow-x: auto;[\s\S]*?overscroll-behavior-x: contain;/,
  "Register table should keep wide columns inside a local horizontal scroll area.",
);
assert.match(
  registerStylesSource,
  /v2\.10 responsive register containment/,
  "Register styles should include the v2.10 responsive containment rules.",
);

assert.equal(
  packageJson.scripts["test:v210:responsive-scaling"],
  "tsx tests/v210-responsive-scaling.ts",
  "package.json should expose the v2.10 responsive scaling test.",
);
assert.equal(
  packageJson.scripts["test:v210"],
  "pnpm test:v210:responsive-scaling",
  "package.json should expose the v2.10 aggregate test.",
);

console.log("v2.10 responsive scaling regression checks passed");
