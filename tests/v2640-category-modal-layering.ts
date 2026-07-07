import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("apps/web/src/styles/globals.css", "utf8");

const stickyHeaderMatch = css.match(/\.budget-sticky-working-header\s*\{[\s\S]*?z-index:\s*(\d+);[\s\S]*?\}/);
const modalBackdropMatch = css.match(/\.category-management-modal-backdrop\s*\{[\s\S]*?z-index:\s*(\d+);[\s\S]*?\}/);

assert.ok(stickyHeaderMatch, "budget sticky header z-index should remain explicit");
assert.ok(modalBackdropMatch, "category management modal backdrop z-index should remain explicit");

const stickyHeaderZIndex = Number(stickyHeaderMatch[1]);
const modalBackdropZIndex = Number(modalBackdropMatch[1]);

assert.ok(
  modalBackdropZIndex > stickyHeaderZIndex,
  `category edit modal should layer above the sticky budget header (${modalBackdropZIndex} <= ${stickyHeaderZIndex})`,
);

assert.ok(
  modalBackdropZIndex >= 10000,
  "category edit modal should use the application modal layer, not a local page layer",
);

console.log("v2.64.0 category modal layering checks passed");
