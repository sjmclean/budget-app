import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tableLayoutSource = readFileSync(
  "apps/web/src/features/tableLayout/tableLayout.ts",
  "utf8",
);
const columnResizeHandleSource = readFileSync(
  "apps/web/src/features/tableLayout/ColumnResizeHandle.tsx",
  "utf8",
);
const columnVisibilityMenuSource = readFileSync(
  "apps/web/src/features/tableLayout/ColumnVisibilityMenu.tsx",
  "utf8",
);
const registerPageSource = readFileSync(
  "apps/web/src/pages/AccountRegisterPage.tsx",
  "utf8",
);
const budgetPageSource = readFileSync("apps/web/src/pages/BudgetPage.tsx", "utf8");
const globalsSource = readFileSync("apps/web/src/styles/globals.css", "utf8");
const v205TestSource = readFileSync("tests/v205-shared-dropdown-menu.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.match(
  tableLayoutSource,
  /export type TableColumnWidths/,
  "tableLayout should expose shared column width state.",
);
assert.match(
  tableLayoutSource,
  /getTableLayoutWidthStorageKey/,
  "tableLayout should persist widths separately from visibility preferences.",
);
assert.match(
  tableLayoutSource,
  /readTableColumnWidths/,
  "tableLayout should read persisted column widths.",
);
assert.match(
  tableLayoutSource,
  /writeTableColumnWidths/,
  "tableLayout should write persisted column widths.",
);
assert.match(
  tableLayoutSource,
  /resizeColumn:/,
  "useTableLayout should expose resizeColumn.",
);
assert.match(
  tableLayoutSource,
  /startColumnResize:/,
  "useTableLayout should expose startColumnResize for shared drag behaviour.",
);
assert.match(
  tableLayoutSource,
  /resetColumnWidths:/,
  "useTableLayout should expose resetColumnWidths.",
);
assert.match(
  tableLayoutSource,
  /resetLayout:/,
  "useTableLayout should expose resetLayout for visibility and width resets.",
);
assert.match(
  tableLayoutSource,
  /document\.addEventListener\("pointermove"/,
  "shared table layout should own pointermove resizing behaviour.",
);
assert.match(
  tableLayoutSource,
  /gridTemplateColumns:[\s\S]*getColumnWidthRem/,
  "row grid templates should be generated from current column widths.",
);

assert.match(
  columnResizeHandleSource,
  /export function ColumnResizeHandle/,
  "shared ColumnResizeHandle component should exist.",
);
assert.match(
  columnResizeHandleSource,
  /onPointerDown/,
  "ColumnResizeHandle should support drag resizing.",
);
assert.match(
  columnResizeHandleSource,
  /onDoubleClick/,
  "ColumnResizeHandle should support width reset.",
);
assert.match(
  columnResizeHandleSource,
  /ArrowLeft/,
  "ColumnResizeHandle should support keyboard resize left.",
);
assert.match(
  columnResizeHandleSource,
  /ArrowRight/,
  "ColumnResizeHandle should support keyboard resize right.",
);

assert.match(
  columnVisibilityMenuSource,
  /Reset layout/,
  "ColumnVisibilityMenu should keep a reset layout action.",
);
assert.match(
  registerPageSource,
  /ColumnResizeHandle/,
  "Register header should use shared ColumnResizeHandle.",
);
assert.match(
  registerPageSource,
  /onResizeStart=\{registerTableLayout\.startColumnResize\}/,
  "Register resize handles should use the shared table layout resize starter.",
);
assert.match(
  registerPageSource,
  /onReset=\{registerTableLayout\.resetLayout\}/,
  "Register column menu should reset visibility and widths together.",
);
assert.match(
  registerPageSource,
  /buildTableRowStyle\([\s\S]*registerTableLayout\.columnWidths/,
  "Register edit rows should use shared persisted column widths.",
);
assert.match(
  budgetPageSource,
  /ColumnResizeHandle/,
  "Budget header should use shared ColumnResizeHandle.",
);
assert.match(
  budgetPageSource,
  /onResizeStart=\{budgetTableLayout\.startColumnResize\}/,
  "Budget resize handles should use the shared table layout resize starter.",
);
assert.match(
  budgetPageSource,
  /onReset=\{budgetTableLayout\.resetLayout\}/,
  "Budget column menu should reset visibility and widths together.",
);
assert.match(
  globalsSource,
  /table-layout-column-resize-handle/,
  "Global styles should include shared resize handle styles.",
);
assert.doesNotMatch(
  v205TestSource,
  /<DropdownMenu\s+label="Columns ▾"/,
  "v2.05 regression test should not require the old Register-specific Columns DropdownMenu implementation after v2.06.",
);
assert.equal(
  packageJson.scripts["test:v207:shared-column-resizing"],
  "tsx tests/v207-shared-column-resizing.ts",
  "package.json should expose the v2.07 shared column resizing test.",
);
assert.equal(
  packageJson.scripts["test:v207"],
  "pnpm test:v207:shared-column-resizing",
  "package.json should expose the v2.07 aggregate test.",
);

console.log("v2.07 shared column resizing regression checks passed");
