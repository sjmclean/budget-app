import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const budgetPageSource = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");
const columnResizeHandleSource = readFileSync(
  "apps/web/src/features/tableLayout/ColumnResizeHandle.tsx",
  "utf8",
);
const globalsSource = readFileSync("apps/web/src/styles/globals.css", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.match(
  budgetPageSource,
  /onClick=\{budgetTableLayout\.resetColumnWidths\}/,
  "Budget display controls should expose a visible reset for persisted column widths.",
);
assert.match(
  budgetPageSource,
  /Reset column widths/,
  "Budget display controls should label the reset-width action clearly.",
);
assert.match(
  budgetPageSource,
  /Drag header grips to resize columns\./,
  "Budget display controls should include a visible user cue for resizing.",
);
assert.doesNotMatch(
  budgetPageSource,
  /ColumnVisibilityMenu/,
  "Budget table layout polish should not add hide/show controls for mandatory Budget columns.",
);

assert.match(
  columnResizeHandleSource,
  /table-layout-column-resize-grip/,
  "ColumnResizeHandle should render a visible grip marker instead of an invisible hit target.",
);
assert.match(
  columnResizeHandleSource,
  /use left and right arrow keys/,
  "ColumnResizeHandle accessible labelling should describe keyboard resize support.",
);
assert.match(
  columnResizeHandleSource,
  /Double-click to reset width/,
  "ColumnResizeHandle should keep the per-column reset affordance.",
);

assert.match(
  globalsSource,
  /width:\s*1\.2rem/,
  "Shared resize handle hit area should be larger than the old hidden 0.6rem target.",
);
assert.match(
  globalsSource,
  /table-layout-column-resize-grip/,
  "Shared resize styles should include visible grip styling.",
);
assert.match(
  globalsSource,
  /table-layout-resizing \*/,
  "Dragging should keep the column-resize cursor across the page while resizing.",
);
assert.match(
  globalsSource,
  /budget-table-layout-help/,
  "Budget display bar should have styling for the resize help cue.",
);

assert.equal(
  packageJson.scripts["test:v2240:budget-table-layout-ux"],
  "tsx tests/v2240-budget-table-layout-ux.ts",
  "package.json should expose the v2.24.0 Budget table layout UX test.",
);
assert.equal(
  packageJson.scripts["test:v2240"],
  "pnpm test:v2240:budget-table-layout-ux",
  "package.json should expose the v2.24.0 aggregate test.",
);

console.log("v2.24.0 budget table layout UX checks passed");
