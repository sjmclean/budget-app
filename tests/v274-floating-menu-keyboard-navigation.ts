import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(
  "apps/web/src/features/floatingUi/FloatingMenu.tsx",
  "utf8",
);

assert.match(
  component,
  /function getFocusableMenuItems/,
  "FloatingMenu should centralise focusable menu item discovery.",
);
assert.match(
  component,
  /\[role="menuitem"\]:not\(:disabled\)/,
  "FloatingMenu should prefer enabled menuitem roles for keyboard navigation.",
);
assert.match(
  component,
  /function focusMenuItem/,
  "FloatingMenu should centralise menu item focus movement.",
);
assert.match(
  component,
  /function resolveFocusedMenuItemIndex/,
  "FloatingMenu should resolve the currently focused menu item.",
);
assert.match(
  component,
  /function handleFloatingMenuKeyDown/,
  "FloatingMenu should centralise menu keyboard handling.",
);
assert.match(
  component,
  /event\.key === "ArrowDown"/,
  "FloatingMenu should support ArrowDown navigation.",
);
assert.match(
  component,
  /event\.key === "ArrowUp"/,
  "FloatingMenu should support ArrowUp navigation.",
);
assert.match(
  component,
  /event\.key === "Home"/,
  "FloatingMenu should support Home navigation.",
);
assert.match(
  component,
  /event\.key === "End"/,
  "FloatingMenu should support End navigation.",
);
assert.match(
  component,
  /tabIndex=\{-1\}/,
  "FloatingMenu panel should be programmatically focusable.",
);
assert.match(
  component,
  /onKeyDown=\{handleFloatingMenuKeyDown\}/,
  "FloatingMenu panel should wire shared keyboard navigation.",
);

console.log("v2.74 floating menu keyboard navigation checks passed");
