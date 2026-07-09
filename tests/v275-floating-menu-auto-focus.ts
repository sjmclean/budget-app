import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(
  "apps/web/src/features/floatingUi/FloatingMenu.tsx",
  "utf8",
);

assert.match(
  component,
  /autoFocusFirstItem\?: boolean/,
  "FloatingMenu should expose an auto-focus opt-out prop.",
);
assert.match(
  component,
  /autoFocusFirstItem = true/,
  "FloatingMenu should auto-focus the first item by default.",
);
assert.match(
  component,
  /function focusFirstMenuItem/,
  "FloatingMenu should centralise first-item focus.",
);
assert.match(
  component,
  /focusMenuItem\(menu, 0\)/,
  "FloatingMenu should focus the first enabled item through shared focus movement.",
);
assert.match(
  component,
  /useEffect\(\(\) => \{/,
  "FloatingMenu should focus after render via an effect.",
);
assert.match(
  component,
  /!isOpen \|\| !position \|\| !autoFocusFirstItem/,
  "FloatingMenu should avoid focusing when closed, unpositioned, or opted out.",
);
assert.match(
  component,
  /window\.requestAnimationFrame/,
  "FloatingMenu should defer first-item focus until after layout.",
);
assert.match(
  component,
  /function useMergedFloatingRef/,
  "FloatingMenu should merge internal and external floating refs.",
);
assert.match(
  component,
  /internalRef\.current = node/,
  "FloatingMenu should maintain an internal panel ref for focus management.",
);
assert.match(
  component,
  /externalRef.*current.*node/s,
  "FloatingMenu should continue updating external refs supplied by controllers.",
);
assert.match(
  component,
  /ref=\{setRef\}/,
  "FloatingMenu should use the merged ref callback on the panel.",
);

console.log("v2.75 floating menu auto-focus checks passed");
