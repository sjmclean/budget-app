import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(
  "apps/web/src/features/floatingUi/FloatingMenuItem.tsx",
  "utf8",
);
const styles = readFileSync(
  "apps/web/src/features/floatingUi/floatingMenu.css",
  "utf8",
);
const barrel = readFileSync("apps/web/src/features/floatingUi/index.ts", "utf8");

assert.match(
  component,
  /export function FloatingMenuItem/,
  "Floating UI should expose a reusable menu item component.",
);
assert.match(
  component,
  /FloatingMenuItemVariant = "default" \| "success" \| "danger"/,
  "Floating menu items should support default, success, and danger variants.",
);
assert.match(
  component,
  /role="menuitem"/,
  "Floating menu items should render with menuitem semantics.",
);
assert.match(
  component,
  /aria-pressed=\{pressed \?\? buttonProps\["aria-pressed"\]\}/,
  "Floating menu items should support pressed state.",
);
assert.match(
  component,
  /Icon \? <Icon size=\{15\} aria-hidden="true" \/> : null/,
  "Floating menu items should support leading icons.",
);
assert.match(
  component,
  /export function FloatingMenuDivider/,
  "Floating UI should expose a reusable menu divider.",
);
assert.match(
  component,
  /role="separator"/,
  "Floating menu dividers should render with separator semantics.",
);
assert.match(
  styles,
  /\.floating-menu-item/,
  "Floating menu item base styles should exist.",
);
assert.match(
  styles,
  /\.floating-menu-item-success/,
  "Floating menu item success styles should exist.",
);
assert.match(
  styles,
  /\.floating-menu-item-danger/,
  "Floating menu item danger styles should exist.",
);
assert.match(
  styles,
  /\.floating-menu-item-pressed/,
  "Floating menu item pressed styles should exist.",
);
assert.match(
  styles,
  /\.floating-menu-divider/,
  "Floating menu divider styles should exist.",
);
assert.match(
  barrel,
  /FloatingMenuItem/,
  "Floating menu item primitives should be exported from the floating UI barrel.",
);
assert.match(
  barrel,
  /FloatingMenuDivider/,
  "Floating menu divider primitive should be exported from the floating UI barrel.",
);

console.log("v2.72 floating menu item checks passed");
