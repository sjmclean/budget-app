import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveFloatingPosition,
  resolveFloatingPositionFromMouseEvent,
} from "../apps/web/src/features/floatingUi";

const source = readFileSync(
  "apps/web/src/features/floatingUi/floatingPositioning.ts",
  "utf8",
);
const barrel = readFileSync("apps/web/src/features/floatingUi/index.ts", "utf8");

assert.match(
  source,
  /resolveFloatingPosition/,
  "Floating UI should expose a reusable position resolver.",
);
assert.match(
  source,
  /flipPlacement/,
  "Floating UI should support screen-edge placement flipping.",
);
assert.match(
  source,
  /clamp/,
  "Floating UI should clamp menus within viewport padding.",
);
assert.match(
  barrel,
  /resolveFloatingPositionFromMouseEvent/,
  "Floating UI helpers should be exported from a feature barrel.",
);

assert.deepEqual(
  resolveFloatingPosition({
    anchor: { x: 100, y: 100 },
    floatingSize: { width: 220, height: 180 },
    viewport: { width: 900, height: 700 },
  }),
  {
    top: 106,
    left: 100,
    placement: "bottom-start",
  },
  "Menus should open below the pointer when there is enough room.",
);

assert.deepEqual(
  resolveFloatingPosition({
    anchor: { x: 880, y: 680 },
    floatingSize: { width: 220, height: 180 },
    viewport: { width: 900, height: 700 },
  }),
  {
    top: 494,
    left: 668,
    placement: "top-start",
  },
  "Menus should flip upward and clamp horizontally near the lower-right edge.",
);

assert.deepEqual(
  resolveFloatingPosition({
    anchor: { x: 8, y: 8 },
    floatingSize: { width: 220, height: 180 },
    viewport: { width: 900, height: 700 },
    preferredPlacement: "top-start",
  }),
  {
    top: 14,
    left: 12,
    placement: "bottom-start",
  },
  "Menus should flip downward and respect viewport padding near the upper-left edge.",
);

assert.deepEqual(
  resolveFloatingPositionFromMouseEvent(
    { clientX: 700, clientY: 500 },
    {
      floatingSize: { width: 240, height: 120 },
      viewport: { width: 800, height: 600 },
      preferredPlacement: "bottom-end",
    },
  ),
  {
    top: 374,
    left: 460,
    placement: "top-end",
  },
  "Mouse event helpers should reuse the same collision-aware positioning rules.",
);

console.log("v2.67 floating UI framework checks passed");
