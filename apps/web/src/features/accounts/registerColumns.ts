import type { RegisterColumnId } from "./components/TransactionRow";
import type { TableColumnDefinition } from "../tableLayout/tableLayout";

export const REGISTER_TABLE_LAYOUT_STORAGE_KEY_PREFIX =
  "budget-app.register-columns.v1";

export const REGISTER_COLUMN_DEFINITIONS: readonly TableColumnDefinition<RegisterColumnId>[] =
  [
    { id: "select", label: "Select", template: "1.8rem", widthRem: 1.8, minWidthRem: 1.6 },
    { id: "date", label: "Date", template: "minmax(5.2rem, 6.4rem)", widthRem: 6.4, minWidthRem: 5.2 },
    { id: "flag", label: "Flag", template: "2.2rem", widthRem: 2.2, minWidthRem: 2, canHide: true },
    { id: "attachments", label: "Attachments", template: "2.2rem", widthRem: 2.2, minWidthRem: 2, canHide: true },
    { id: "payee", label: "Payee", template: "minmax(6.5rem, 1.45fr)", widthRem: 11, minWidthRem: 6.5 },
    { id: "category", label: "Category", template: "minmax(6.5rem, 1.2fr)", widthRem: 10, minWidthRem: 6.5 },
    { id: "memo", label: "Memo", template: "minmax(5.5rem, 1.3fr)", widthRem: 10, minWidthRem: 5.5, canHide: true },
    { id: "checkNumber", label: "Check #", template: "minmax(3.4rem, 4.5rem)", widthRem: 4.5, minWidthRem: 3.4, canHide: true },
    { id: "amount", label: "Amount", template: "minmax(6.4rem, 8.4rem)", widthRem: 8.4, minWidthRem: 6.4 },
    { id: "runningBalance", label: "Running Balance", template: "minmax(6.2rem, 7.5rem)", widthRem: 7.5, minWidthRem: 6.2, canHide: true },
    { id: "status", label: "Cleared", template: "2.2rem", widthRem: 2.2, minWidthRem: 2, canHide: true },
  ];

const REGISTER_OUTFLOW_COLUMN_DEFINITION: TableColumnDefinition<RegisterColumnId> = {
  id: "outflow",
  label: "Outflow",
  template: "minmax(5.6rem, 7.2rem)",
  widthRem: 7.2,
  minWidthRem: 5.6,
};

const REGISTER_INFLOW_COLUMN_DEFINITION: TableColumnDefinition<RegisterColumnId> = {
  id: "inflow",
  label: "Inflow",
  template: "minmax(5.6rem, 7.2rem)",
  widthRem: 7.2,
  minWidthRem: 5.6,
};

export const REGISTER_EDIT_COLUMN_DEFINITIONS: readonly TableColumnDefinition<RegisterColumnId>[] =
  REGISTER_COLUMN_DEFINITIONS.flatMap((column) => {
    if (column.id === "amount") {
      return [REGISTER_OUTFLOW_COLUMN_DEFINITION, REGISTER_INFLOW_COLUMN_DEFINITION];
    }

    if (column.id === "runningBalance" || column.id === "status") {
      return [];
    }

    return [column];
  });

export const REGISTER_COLUMN_LABELS = new Map(
  [...REGISTER_COLUMN_DEFINITIONS, ...REGISTER_EDIT_COLUMN_DEFINITIONS].map(
    (column) => [column.id, column.label] as const,
  ),
);

export function isRegisterColumnVisible(
  column: RegisterColumnId,
  visibleColumns: Set<RegisterColumnId>,
): boolean {
  return visibleColumns.has(column);
}

export function buildRegisterEditVisibleColumnIds(
  visibleColumnIds: readonly RegisterColumnId[],
): RegisterColumnId[] {
  const editColumnIds: RegisterColumnId[] = [];

  for (const columnId of visibleColumnIds) {
    if (columnId === "amount") {
      editColumnIds.push("outflow", "inflow");
      continue;
    }

    if (columnId !== "runningBalance" && columnId !== "status") {
      editColumnIds.push(columnId);
    }
  }

  return editColumnIds;
}

const REGISTER_ENTRY_INPUT_COLUMN_IDS = new Set<RegisterColumnId>([
  "date",
  "payee",
  "category",
  "memo",
  "checkNumber",
  "outflow",
  "inflow",
]);

export function isRegisterEntryInputColumn(column: RegisterColumnId): boolean {
  return REGISTER_ENTRY_INPUT_COLUMN_IDS.has(column);
}