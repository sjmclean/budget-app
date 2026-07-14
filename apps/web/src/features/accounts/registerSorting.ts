import type { RegisterTransactionView } from "./accountRegisterTypes";

export const REGISTER_SORT_STORAGE_KEY_PREFIX = "budget-app.register-sort.v1";

export type RegisterSortColumn =
  | "date"
  | "payee"
  | "category"
  | "memo"
  | "outflow"
  | "inflow";

export type RegisterSortDirection = "ascending" | "descending";

export interface RegisterSortState {
  column: RegisterSortColumn;
  direction: RegisterSortDirection;
}

export const DEFAULT_REGISTER_SORT: RegisterSortState = Object.freeze({
  column: "date",
  direction: "descending",
});

export function getRegisterSortStorageKey(scopeId: string): string {
  return `${REGISTER_SORT_STORAGE_KEY_PREFIX}.${scopeId}`;
}

export function readRegisterSort(scopeId: string): RegisterSortState {
  if (typeof window === "undefined") return DEFAULT_REGISTER_SORT;

  try {
    const raw = window.localStorage.getItem(getRegisterSortStorageKey(scopeId));
    if (!raw) return DEFAULT_REGISTER_SORT;
    const parsed = JSON.parse(raw) as Partial<RegisterSortState>;
    if (!isRegisterSortColumn(parsed.column) || !isRegisterSortDirection(parsed.direction)) {
      return DEFAULT_REGISTER_SORT;
    }
    return { column: parsed.column, direction: parsed.direction };
  } catch {
    return DEFAULT_REGISTER_SORT;
  }
}

export function writeRegisterSort(scopeId: string, sort: RegisterSortState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getRegisterSortStorageKey(scopeId), JSON.stringify(sort));
  } catch {
    // Sorting remains usable for this session when storage is unavailable.
  }
}

export function nextRegisterSort(
  current: RegisterSortState,
  column: RegisterSortColumn,
): RegisterSortState {
  if (current.column === column) {
    return {
      column,
      direction: current.direction === "ascending" ? "descending" : "ascending",
    };
  }

  return {
    column,
    direction: column === "date" ? "descending" : "ascending",
  };
}

export function sortRegisterTransactions(
  transactions: readonly RegisterTransactionView[],
  sort: RegisterSortState,
): RegisterTransactionView[] {
  const direction = sort.direction === "ascending" ? 1 : -1;

  return [...transactions].sort((left, right) => {
    const comparison = compareRegisterTransactionValue(left, right, sort.column);
    if (comparison !== 0) return comparison * direction;

    const dateComparison = left.date.localeCompare(right.date);
    if (dateComparison !== 0) return dateComparison * -1;
    return left.id.localeCompare(right.id);
  });
}

function compareRegisterTransactionValue(
  left: RegisterTransactionView,
  right: RegisterTransactionView,
  column: RegisterSortColumn,
): number {
  switch (column) {
    case "date":
      return left.date.localeCompare(right.date);
    case "payee":
      return compareText(left.payee, right.payee);
    case "category":
      return compareText(left.category, right.category);
    case "memo":
      return compareText(left.memo ?? "", right.memo ?? "");
    case "outflow":
      return left.outflow - right.outflow;
    case "inflow":
      return left.inflow - right.inflow;
  }
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });
}

function isRegisterSortColumn(value: unknown): value is RegisterSortColumn {
  return (
    value === "date" ||
    value === "payee" ||
    value === "category" ||
    value === "memo" ||
    value === "outflow" ||
    value === "inflow"
  );
}

function isRegisterSortDirection(value: unknown): value is RegisterSortDirection {
  return value === "ascending" || value === "descending";
}
