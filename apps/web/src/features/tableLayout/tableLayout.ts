import { useEffect, useMemo, useState, type CSSProperties } from "react";

export interface TableColumnDefinition<TColumnId extends string> {
  id: TColumnId;
  label: string;
  template: string;
  widthRem: number;
  canHide?: boolean;
  defaultVisible?: boolean;
}

export interface UseTableLayoutOptions<TColumnId extends string> {
  storageKeyPrefix: string;
  scopeId?: string | null;
  columns: readonly TableColumnDefinition<TColumnId>[];
  minimumWidthRem?: number;
}

export interface TableLayoutState<TColumnId extends string> {
  visibleColumnIds: TColumnId[];
  visibleColumnSet: Set<TColumnId>;
  visibleColumns: TableColumnDefinition<TColumnId>[];
  rowStyle: CSSProperties;
  toggleColumn: (columnId: TColumnId) => void;
  resetColumns: () => void;
}

export function getTableLayoutStorageKey(
  storageKeyPrefix: string,
  scopeId?: string | null,
) {
  return `${storageKeyPrefix}.${scopeId || "default"}`;
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

export function buildTableRowStyle<TColumnId extends string>(
  columns: readonly TableColumnDefinition<TColumnId>[],
  visibleColumnIds: readonly TColumnId[],
  minimumWidthRem = 0,
): CSSProperties {
  const visibleColumnSet = new Set(visibleColumnIds);
  const visibleColumns = columns.filter((column) => visibleColumnSet.has(column.id));
  const minimumWidth = visibleColumns.reduce(
    (total, column) => total + column.widthRem,
    0,
  );

  return {
    gridTemplateColumns: visibleColumns.map((column) => column.template).join(" "),
    minWidth: `${Math.max(minimumWidth + visibleColumns.length * 0.75 + 2, minimumWidthRem)}rem`,
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

  useEffect(() => {
    setVisibleColumnIds(readVisibleTableColumns(storageKeyPrefix, columns, scopeId));
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
    () => buildTableRowStyle(columns, visibleColumnIds, minimumWidthRem),
    [columns, minimumWidthRem, visibleColumnIds],
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

  return {
    visibleColumnIds,
    visibleColumnSet,
    visibleColumns,
    rowStyle,
    toggleColumn,
    resetColumns,
  };
}
