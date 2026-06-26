import { DropdownMenu } from "../ui/DropdownMenu";
import type { TableColumnDefinition } from "./tableLayout";

export function ColumnVisibilityMenu<TColumnId extends string>({
  label = "View",
  columns,
  visibleColumnSet,
  onToggleColumn,
  onReset,
}: {
  label?: string;
  columns: readonly TableColumnDefinition<TColumnId>[];
  visibleColumnSet: Set<TColumnId>;
  onToggleColumn: (columnId: TColumnId) => void;
  onReset: () => void;
}) {
  const hideableColumns = columns.filter((column) => column.canHide === true);

  return (
    <DropdownMenu
      label={label}
      ariaLabel={`${label} options`}
      className="table-layout-menu"
      buttonClassName="button button-secondary table-layout-menu-trigger"
      panelClassName="table-layout-menu-panel"
    >
      {({ closeMenu }) => (
        <>
          {hideableColumns.map((column) => (
            <label className="table-layout-column-toggle" key={column.id}>
              <input
                type="checkbox"
                checked={visibleColumnSet.has(column.id)}
                onChange={() => onToggleColumn(column.id)}
              />
              <span>{column.label}</span>
            </label>
          ))}
          <button
            className="table-layout-menu-reset"
            type="button"
            role="menuitem"
            onClick={() => {
              onReset();
              closeMenu({ restoreFocus: true });
            }}
          >
            Reset layout
          </button>
        </>
      )}
    </DropdownMenu>
  );
}
