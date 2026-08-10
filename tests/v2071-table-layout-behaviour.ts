import assert from "node:assert/strict";
import {
  buildTableRowStyle,
  clampColumnWidthRem,
  getColumnWidthRem,
  getDefaultVisibleTableColumns,
  getTableLayoutStorageKey,
  getTableLayoutWidthStorageKey,
  readTableColumnWidths,
  readVisibleTableColumns,
  writeTableColumnWidths,
  writeVisibleTableColumns,
  type TableColumnDefinition,
} from "../apps/web/src/features/tableLayout/tableLayout";

type TestColumnId = "select" | "date" | "memo" | "balance";

const columns: readonly TableColumnDefinition<TestColumnId>[] = [
  { id: "select", label: "Select", template: "2rem", widthRem: 2 },
  { id: "date", label: "Date", template: "7rem", widthRem: 7, minWidthRem: 5, maxWidthRem: 12 },
  { id: "memo", label: "Memo", template: "minmax(12rem, 1fr)", widthRem: 12, canHide: true },
  { id: "balance", label: "Balance", template: "8rem", widthRem: 8, canHide: true, defaultVisible: false },
];

class MemoryLocalStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }

  listKeys(): string[] {
    return [...this.values.keys()].sort();
  }
}

const localStorage = new MemoryLocalStorage();
const scopeId = "household";
const prefix = "budget-app.test-table-layout.v1";

assert.equal(
  getTableLayoutStorageKey(prefix, scopeId),
  "budget-app.test-table-layout.v1.household",
  "visibility storage keys should be scoped by budget/table.",
);
assert.equal(
  getTableLayoutWidthStorageKey(prefix, scopeId),
  "budget-app.test-table-layout.v1.household.widths",
  "width storage keys should be separate from visibility keys.",
);

assert.deepEqual(
  getDefaultVisibleTableColumns(columns),
  ["select", "date", "memo"],
  "columns with defaultVisible=false should be hidden by default.",
);

localStorage.clear();
assert.deepEqual(
  readVisibleTableColumns(prefix, columns, scopeId, {}, localStorage),
  ["select", "date", "memo"],
  "missing replicated visibility preferences should fall back to defaults.",
);

writeVisibleTableColumns(prefix, ["select", "date", "balance"], scopeId, localStorage);
const entityIndexKey = "budget-app.entity-replication.v1/table-layout-index";
const entityIds = JSON.parse(localStorage.getItem(entityIndexKey) ?? "[]") as string[];
assert.equal(entityIds.length, 1, "visibility writes should create one replicated layout entity.");
const entityRecordKey = `budget-app.entity-replication.v1/table-layout/${entityIds[0]}`;
assert.ok(localStorage.getItem(entityRecordKey), "the replicated layout entity record should be persisted.");
assert.equal(localStorage.getItem(getTableLayoutStorageKey(prefix, scopeId)), null, "legacy visibility aggregate keys must not be written.");
assert.deepEqual(
  readVisibleTableColumns(prefix, columns, scopeId, {}, localStorage),
  ["select", "date", "balance"],
  "visibility writes should round-trip through the replicated entity.",
);

assert.equal(
  clampColumnWidthRem(columns[1], 2),
  5,
  "column widths should clamp to explicit minimum widths.",
);
assert.equal(
  clampColumnWidthRem(columns[1], 99),
  12,
  "column widths should clamp to explicit maximum widths.",
);
assert.equal(
  clampColumnWidthRem(columns[2], 3),
  4,
  "columns without explicit minimum widths should use the shared minimum fallback.",
);

assert.deepEqual(
  readTableColumnWidths(prefix, columns, scopeId, {}, localStorage),
  {},
  "missing replicated width preferences should fall back to default widths.",
);

writeTableColumnWidths(prefix, { date: 10, memo: 16 }, scopeId, localStorage);
assert.deepEqual(
  readTableColumnWidths(prefix, columns, scopeId, {}, localStorage),
  { date: 10, memo: 16 },
  "width writes should round-trip through the replicated entity.",
);
assert.equal(localStorage.getItem(getTableLayoutWidthStorageKey(prefix, scopeId)), null, "legacy width aggregate keys must not be written.");

writeTableColumnWidths(prefix, {}, scopeId, localStorage);
assert.deepEqual(
  readTableColumnWidths(prefix, columns, scopeId, {}, localStorage),
  {},
  "empty width preferences should clear replicated custom widths.",
);

assert.equal(
  getColumnWidthRem(columns[1], { date: 9 }),
  9,
  "custom widths should override default widths when present.",
);
assert.equal(
  getColumnWidthRem(columns[1], {}),
  7,
  "default widths should be used when no custom width is present.",
);

const rowStyle = buildTableRowStyle(columns, ["select", "date", "memo"], 30, {
  date: 9,
  memo: 14,
});
assert.equal(
  rowStyle.gridTemplateColumns,
  "2rem 9rem 14rem",
  "row templates should be generated from default and persisted rem widths.",
);
assert.equal(
  rowStyle.minWidth,
  "30rem",
  "row minWidth should respect the caller's larger minimum width.",
);

const widerRowStyle = buildTableRowStyle(columns, ["select", "date", "memo"], 0, {
  date: 9,
  memo: 14,
});
assert.equal(
  widerRowStyle.minWidth,
  "29.25rem",
  "row minWidth should include visible widths plus shared spacing allowance.",
);

console.log("v2.07.1 table layout behaviour regression checks passed");
