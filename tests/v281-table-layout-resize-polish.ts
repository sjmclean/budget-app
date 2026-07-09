import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getTableColumnResizeKeyAction,
  getTableColumnResizeNudgeRem,
  TABLE_COLUMN_RESIZE_COARSE_NUDGE_REM,
  TABLE_COLUMN_RESIZE_FINE_NUDGE_REM,
  TABLE_COLUMN_RESIZE_NUDGE_REM,
} from "../apps/web/src/features/tableLayout/tableLayoutResize";

assert.equal(
  getTableColumnResizeNudgeRem({ key: "ArrowRight" }),
  TABLE_COLUMN_RESIZE_NUDGE_REM,
  "Default resize nudge should use the standard step.",
);
assert.equal(
  getTableColumnResizeNudgeRem({ key: "ArrowRight", altKey: true }),
  TABLE_COLUMN_RESIZE_FINE_NUDGE_REM,
  "Alt resize nudge should use the fine step.",
);
assert.equal(
  getTableColumnResizeNudgeRem({ key: "ArrowRight", shiftKey: true }),
  TABLE_COLUMN_RESIZE_COARSE_NUDGE_REM,
  "Shift resize nudge should use the coarse step.",
);
assert.deepEqual(
  getTableColumnResizeKeyAction({ key: "ArrowLeft" }),
  { type: "nudge", deltaRem: -TABLE_COLUMN_RESIZE_NUDGE_REM },
  "ArrowLeft should shrink by the standard step.",
);
assert.deepEqual(
  getTableColumnResizeKeyAction({ key: "ArrowRight", altKey: true }),
  { type: "nudge", deltaRem: TABLE_COLUMN_RESIZE_FINE_NUDGE_REM },
  "Alt+ArrowRight should grow by the fine step.",
);
assert.deepEqual(
  getTableColumnResizeKeyAction({ key: "ArrowLeft", shiftKey: true }),
  { type: "nudge", deltaRem: -TABLE_COLUMN_RESIZE_COARSE_NUDGE_REM },
  "Shift+ArrowLeft should shrink by the coarse step.",
);
assert.deepEqual(
  getTableColumnResizeKeyAction({ key: "Home" }),
  { type: "reset" },
  "Home should reset column width.",
);
assert.deepEqual(
  getTableColumnResizeKeyAction({ key: "Enter" }),
  { type: "reset" },
  "Enter should reset column width.",
);
assert.equal(
  getTableColumnResizeKeyAction({ key: "Escape" }),
  null,
  "Unrelated keys should not trigger resize actions.",
);

const handle = readFileSync(
  "apps/web/src/features/tableLayout/ColumnResizeHandle.tsx",
  "utf8",
);

assert.match(
  handle,
  /getTableColumnResizeKeyAction/,
  "Column resize handle should use the shared keyboard helper.",
);
assert.match(
  handle,
  /event\.stopPropagation\(\)/,
  "Column resize keyboard handling should avoid leaking into parent grid handlers.",
);
assert.match(
  handle,
  /aria-keyshortcuts=/,
  "Column resize handle should expose keyboard shortcuts to assistive tech.",
);
assert.match(
  handle,
  /Alt\+ArrowLeft/,
  "Column resize handle should document fine keyboard adjustments.",
);
assert.match(
  handle,
  /Shift\+ArrowRight/,
  "Column resize handle should document coarse keyboard adjustments.",
);

console.log("v2.81 table layout resize polish checks passed");
