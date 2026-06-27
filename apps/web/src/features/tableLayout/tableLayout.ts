import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";

export interface TableColumnDefinition<TColumnId extends string> {
  id: TColumnId;
  label: string;
  template: string;
  widthRem: number;
  minWidthRem?: number;
  maxWidthRem?: number;
  canHide?: boolean;
  defaultVisible?: boolean;
}

export interface UseTableLayoutOptions<TColumnId extends string> {
  storageKeyPrefix: string;
  scopeId?: string | null;
  columns: readonly TableColumnDefinition<TColumnId>[];
  minimumWidthRem?: number;
}

export type TableColumnWidths<TColumnId extends string> = Partial<
  Record<TColumnId, number>
>;

export interface TableLayoutState<TColumnId extends string> {
  visibleColumnIds: TColumnId[];
  visibleColumnSet: Set<TColumnId>;
  visibleColumns: TableColumnDefinition<TColumnId>[];
  columnWidths: TableColumnWidths<TColumnId>;
  rowStyle: CSSProperties;
  toggleColumn: (columnId: TColumnId) => void;
  resizeColumn: (columnId: TColumnId, widthRem: number) => void;
  nudgeColumnWidth: (columnId: TColumnId, deltaRem: number) => void;
  resetColumnWidth: (columnId: TColumnId) => void;
  resetColumnWidths: () => void;
  resetColumns: () => void;
  resetLayout: () => void;
  startColumnResize: (columnId: TColumnId, startClientX: number) => void;
}

export function getTableLayoutStorageKey(
  storageKeyPrefix: string,
  scopeId?: string | null,
) {
  return `${storageKeyPrefix}.${scopeId || "default"}`;
}

export function getTableLayoutWidthStorageKey(
  storageKeyPrefix: string,
  scopeId?: string | null,
) {
  return `${getTableLayoutStorageKey(storageKeyPrefix, scopeId)}.widths`;
}

export function getDefaultVisibleTableColumns<TColumnId extends string>(
  columns: readonly TableColumnDefinition<TColumnId>[],
): TColumnId[] {
  return columns
    .filter((column) => column.defaultVisible !== false)
    .map((column) => column.id);
}

export function readVisibleTableColumns<TColumnId extends string>(
  storageKeyPrefix: string,
  columns: readonly TableColumnDefinition<TColumnId>[],
  scopeId?: string | null,
): TColumnId[] {
  const defaultVisibleColumns = getDefaultVisibleTableColumns(columns);

  if (typeof window === "undefined") {
    return defaultVisibleColumns;
  }

  const stored = window.localStorage.getItem(
    getTableLayoutStorageKey(storageKeyPrefix, scopeId),
  );

  if (!stored) {
    return defaultVisibleColumns;
  }

  try {
    const parsed = JSON.parse(stored);

    if (!Array.isArray(parsed)) {
      return defaultVisibleColumns;
    }

    const knownColumnIds = new Set(columns.map((column) => column.id));
    const visibleColumns = parsed.filter((column): column is TColumnId =>
      knownColumnIds.has(column as TColumnId),
    );

    const requiredColumns = columns
      .filter((column) => column.canHide !== true)
      .map((column) => column.id);

    return Array.from(new Set([...requiredColumns, ...visibleColumns]));
  } catch {
    return defaultVisibleColumns;
  }
}

export function writeVisibleTableColumns<TColumnId extends string>(
  storageKeyPrefix: string,
  visibleColumns: readonly TColumnId[],
  scopeId?: string | null,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    getTableLayoutStorageKey(storageKeyPrefix, scopeId),
    JSON.stringify(visibleColumns),
  );
}

export function getColumnWidthRem<TColumnId extends string>(
  column: TableColumnDefinition<TColumnId>,
  columnWidths: TableColumnWidths<TColumnId>,
): number {
  return columnWidths[column.id] ?? column.widthRem;
}

export function getMinimumColumnWidthRem<TColumnId extends string>(
  column: TableColumnDefinition<TColumnId>,
): number {
  return column.minWidthRem ?? Math.max(2, Math.min(column.widthRem, 4));
}

export function clampColumnWidthRem<TColumnId extends string>(
  column: TableColumnDefinition<TColumnId>,
  widthRem: number,
): number {
  const minimumWidth = getMinimumColumnWidthRem(column);
  const maximumWidth = column.maxWidthRem ?? 48;

  return Math.min(Math.max(widthRem, minimumWidth), maximumWidth);
}

export function readTableColumnWidths<TColumnId extends string>(
  storageKeyPrefix: string,
  columns: readonly TableColumnDefinition<TColumnId>[],
  scopeId?: string | null,
): TableColumnWidths<TColumnId> {
  if (typeof window === "undefined") {
    return {};
  }

  const stored = window.localStorage.getItem(
    getTableLayoutWidthStorageKey(storageKeyPrefix, scopeId),
  );

  if (!stored) {
    return {};
  }

  try {
    const parsed = JSON.parse(stored);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const columnMap = new Map(columns.map((column) => [column.id, column]));
    const nextWidths: TableColumnWidths<TColumnId> = {};

    for (const [columnId, rawWidth] of Object.entries(parsed)) {
      const column = columnMap.get(columnId as TColumnId);
      const width = Number(rawWidth);

      if (!column || !Number.isFinite(width)) {
        continue;
      }

      nextWidths[column.id] = clampColumnWidthRem(column, width);
    }

    return nextWidths;
  } catch {
    return {};
  }
}

export function writeTableColumnWidths<TColumnId extends string>(
  storageKeyPrefix: string,
  columnWidths: TableColumnWidths<TColumnId>,
  scopeId?: string | null,
) {
  if (typeof window === "undefined") {
    return;
  }

  const storageKey = getTableLayoutWidthStorageKey(storageKeyPrefix, scopeId);
  const widthEntries = Object.entries(columnWidths).filter(
    ([, width]) => typeof width === "number" && Number.isFinite(width),
  );

  if (widthEntries.length === 0) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(widthEntries)));
}

export function buildTableRowStyle<TColumnId extends string>(
  columns: readonly TableColumnDefinition<TColumnId>[],
  visibleColumnIds: readonly TColumnId[],
  minimumWidthRem = 0,
  columnWidths: TableColumnWidths<TColumnId> = {},
): CSSProperties {
  const visibleColumnSet = new Set(visibleColumnIds);
  const visibleColumns = columns.filter((column) => visibleColumnSet.has(column.id));
  const minimumWidth = visibleColumns.reduce(
    (total, column) =>
      total +
      (typeof columnWidths[column.id] === "number"
        ? getColumnWidthRem(column, columnWidths)
        : getMinimumColumnWidthRem(column)),
    0,
  );

  return {
    gridTemplateColumns: visibleColumns
      .map((column) =>
        typeof columnWidths[column.id] === "number"
          ? `${getColumnWidthRem(column, columnWidths)}rem`
          : column.template,
      )
      .join(" "),
    minWidth: `${Math.max(minimumWidth + visibleColumns.length * 0.75 + 2, minimumWidthRem)}rem`,
    width: "100%",
  };
}

export function useTableLayout<TColumnId extends string>({
  storageKeyPrefix,
  scopeId,
  columns,
  minimumWidthRem = 0,
}: UseTableLayoutOptions<TColumnId>): TableLayoutState<TColumnId> {
  const [visibleColumnIds, setVisibleColumnIds] = useState<TColumnId[]>(() =>
    readVisibleTableColumns(storageKeyPrefix, columns, scopeId),
  );
  const [columnWidths, setColumnWidths] = useState<TableColumnWidths<TColumnId>>(
    () => readTableColumnWidths(storageKeyPrefix, columns, scopeId),
  );

  useEffect(() => {
    setVisibleColumnIds(readVisibleTableColumns(storageKeyPrefix, columns, scopeId));
    setColumnWidths(readTableColumnWidths(storageKeyPrefix, columns, scopeId));
  }, [columns, scopeId, storageKeyPrefix]);

  const visibleColumnSet = useMemo(
    () => new Set<TColumnId>(visibleColumnIds),
    [visibleColumnIds],
  );

  const visibleColumns = useMemo(
    () => columns.filter((column) => visibleColumnSet.has(column.id)),
    [columns, visibleColumnSet],
  );

  const rowStyle = useMemo(
    () => buildTableRowStyle(columns, visibleColumnIds, minimumWidthRem, columnWidths),
    [columns, columnWidths, minimumWidthRem, visibleColumnIds],
  );

  const resizeColumn = useCallback(
    (columnId: TColumnId, widthRem: number) => {
      const column = columns.find((candidate) => candidate.id === columnId);

      if (!column) {
        return;
      }

      setColumnWidths((current) => {
        const next = {
          ...current,
          [columnId]: clampColumnWidthRem(column, widthRem),
        };
        writeTableColumnWidths(storageKeyPrefix, next, scopeId);
        return next;
      });
    },
    [columns, scopeId, storageKeyPrefix],
  );

  const nudgeColumnWidth = useCallback(
    (columnId: TColumnId, deltaRem: number) => {
      const column = columns.find((candidate) => candidate.id === columnId);

      if (!column) {
        return;
      }

      const currentWidth = getColumnWidthRem(column, columnWidths);
      resizeColumn(columnId, currentWidth + deltaRem);
    },
    [columnWidths, columns, resizeColumn],
  );

  const resetColumnWidth = useCallback(
    (columnId: TColumnId) => {
      setColumnWidths((current) => {
        const next = { ...current };
        delete next[columnId];
        writeTableColumnWidths(storageKeyPrefix, next, scopeId);
        return next;
      });
    }, [scopeId, storageKeyPrefix]);

  const resetColumnWidths = useCallback(() => {
    setColumnWidths({});
    writeTableColumnWidths(storageKeyPrefix, {}, scopeId);
  }, [scopeId, storageKeyPrefix]);

  const startColumnResize = useCallback(
    (columnId: TColumnId, startClientX: number) => {
      const column = columns.find((candidate) => candidate.id === columnId);

      if (!column || typeof document === "undefined") {
        return;
      }

      const rootFontSize = Number.parseFloat(
        window.getComputedStyle(document.documentElement).fontSize,
      );
      const remInPixels = Number.isFinite(rootFontSize) && rootFontSize > 0 ? rootFontSize : 16;
      const startWidth = getColumnWidthRem(column, columnWidths);

      function handlePointerMove(event: PointerEvent) {
        const deltaRem = (event.clientX - startClientX) / remInPixels;
        resizeColumn(columnId, startWidth + deltaRem);
      }

      function handlePointerUp() {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
        document.body.classList.remove("table-layout-resizing");
      }

      document.body.classList.add("table-layout-resizing");
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp, { once: true });
    },
    [columnWidths, columns, resizeColumn],
  );

  function toggleColumn(columnId: TColumnId) {
    const column = columns.find((candidate) => candidate.id === columnId);

    if (!column || column.canHide !== true) {
      return;
    }

    setVisibleColumnIds((current) => {
      const currentSet = new Set(current);
      const next = currentSet.has(columnId)
        ? current.filter((visibleColumn) => visibleColumn !== columnId)
        : columns
            .filter((candidate) =>
              currentSet.has(candidate.id) || candidate.id === columnId,
            )
            .map((candidate) => candidate.id);

      writeVisibleTableColumns(storageKeyPrefix, next, scopeId);
      return next;
    });
  }

  function resetColumns() {
    const next = getDefaultVisibleTableColumns(columns);
    setVisibleColumnIds(next);
    writeVisibleTableColumns(storageKeyPrefix, next, scopeId);
  }

  function resetLayout() {
    resetColumns();
    resetColumnWidths();
  }

  return {
    visibleColumnIds,
    visibleColumnSet,
    visibleColumns,
    columnWidths,
    rowStyle,
    toggleColumn,
    resizeColumn,
    nudgeColumnWidth,
    resetColumnWidth,
    resetColumnWidths,
    resetColumns,
    resetLayout,
    startColumnResize,
  };
}
