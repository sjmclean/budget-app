import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controller = readFileSync(
  "apps/web/src/features/floatingUi/useFloatingController.ts",
  "utf8",
);
const barrel = readFileSync("apps/web/src/features/floatingUi/index.ts", "utf8");

assert.match(
  controller,
  /export function useFloatingController/,
  "Floating UI should expose a shared controller hook.",
);
assert.match(
  controller,
  /resolveFloatingPositionFromMouseEvent/,
  "Floating controller should reuse the shared positioning engine.",
);
assert.match(
  controller,
  /window\.addEventListener\("keydown", handleKeyDown\)/,
  "Floating controller should centralise Escape dismissal.",
);
assert.match(
  controller,
  /window\.addEventListener\("scroll", close, true\)/,
  "Floating controller should centralise scroll dismissal.",
);
assert.match(
  controller,
  /restoreFocusRef\.current\?\.focus\(\)/,
  "Floating controller should restore focus after close.",
);
assert.match(
  controller,
  /layerProps/,
  "Floating controller should provide shared outside-click layer props.",
);
assert.match(
  controller,
  /floatingProps/,
  "Floating controller should provide shared floating element props.",
);
assert.match(
  controller,
  /event\.preventDefault\(\)/,
  "Floating controller should prevent native context-menu/default open behaviour.",
);
assert.match(
  controller,
  /event\.stopPropagation\(\)/,
  "Floating controller should stop open events from leaking to parent handlers.",
);
assert.match(
  barrel,
  /useFloatingController/,
  "Floating controller should be exported from the floating UI barrel.",
);

console.log("v2.68 floating controller checks passed");
