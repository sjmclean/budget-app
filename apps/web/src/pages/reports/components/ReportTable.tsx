import type { ReactNode } from "react";

export interface ReportTableColumn<TRow> {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  render: (row: TRow) => ReactNode;
}

interface ReportTableProps<TRow> {
  columns: ReportTableColumn<TRow>[];
  rows: TRow[];
  getRowKey: (row: TRow) => string;
  onRowClick?: (row: TRow) => void;
  ariaLabel: string;
}

export function ReportTable<TRow>({ columns, rows, getRowKey, onRowClick, ariaLabel }: ReportTableProps<TRow>) {
  return (
    <div className="report-table" role="table" aria-label={ariaLabel}>
      <div className="report-table-row report-table-heading" role="row">
        {columns.map((column) => (
          <span className={`report-table-cell report-table-cell-${column.align ?? "left"}`} key={column.key} role="columnheader">
            {column.label}
          </span>
        ))}
      </div>
      {rows.map((row) => {
        const content = columns.map((column) => (
          <span className={`report-table-cell report-table-cell-${column.align ?? "left"}`} key={column.key} role="cell">
            {column.render(row)}
          </span>
        ));

        if (onRowClick) {
          return (
            <button className="report-table-row report-table-row-action" key={getRowKey(row)} onClick={() => onRowClick(row)} role="row" type="button">
              {content}
            </button>
          );
        }

        return (
          <div className="report-table-row" key={getRowKey(row)} role="row">
            {content}
          </div>
        );
      })}
    </div>
  );
}
