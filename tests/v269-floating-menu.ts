import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(
  "apps/web/src/features/floatingUi/FloatingMenu.tsx",
  "utf8",
);
const styles = readFileSync(
  "apps/web/src/features/floatingUi/floatingMenu.css",
  "utf8",
);
const barrel = readFileSync("apps/web/src/features/floatingUi/index.ts", "utf8");

assert.match(
  component,
  /export function FloatingMenu/,
  "Floating UI should expose a reusable FloatingMenu component.",
);
assert.match(
  component,
  /if \(!isOpen \|\| !position\)/,
  "FloatingMenu should render nothing when closed or unpositioned.",
);
assert.match(
  component,
  /role="presentation"/,
  "FloatingMenu should provide a shared outside-click presentation layer.",
);
assert.match(
  component,
  /role="menu"/,
  "FloatingMenu should render the floating panel with menu semantics.",
);
assert.match(
  component,
  /aria-label=\{label\}/,
  "FloatingMenu should require an accessible menu label.",
);
assert.match(
  component,
  /event\.preventDefault\(\)/,
  "FloatingMenu should dismiss native context menus on the layer.",
);
assert.match(
  component,
  /event\.stopPropagation\(\)/,
  "FloatingMenu should keep clicks inside the panel from closing the menu.",
);
assert.match(
  component,
  /export function FloatingMenuHeading/,
  "Floating UI should expose a shared menu heading component.",
);
assert.match(
  component,
  /export function FloatingMenuList/,
  "Floating UI should expose a shared menu list component.",
);
assert.match(
  component,
  /import "\.\/floatingMenu\.css"/,
  "FloatingMenu should own its shared base styles.",
);
assert.match(
  styles,
  /\.floating-menu-layer/,
  "Floating menu layer styles should exist.",
);
assert.match(
  styles,
  /\.floating-menu-panel/,
  "Floating menu panel styles should exist.",
);
assert.match(
  styles,
  /position: fixed/,
  "Floating menu styles should anchor menus to the viewport.",
);
assert.match(
  barrel,
  /FloatingMenu/,
  "Floating menu components should be exported from the floating UI barrel.",
);

console.log("v2.69 floating menu checks passed");
