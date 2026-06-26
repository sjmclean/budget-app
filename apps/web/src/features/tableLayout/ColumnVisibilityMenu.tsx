import { useEffect, useRef, useState } from "react";
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
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const hideableColumns = columns.filter((column) => column.canHide === true);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="table-layout-menu" ref={menuRef}>
      <button
        ref={triggerRef}
        className="button button-secondary table-layout-menu-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        {label}
      </button>

      {isOpen ? (
        <div className="table-layout-menu-panel" role="menu" aria-label={`${label} options`}>
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
              setIsOpen(false);
              triggerRef.current?.focus();
            }}
          >
            Reset layout
          </button>
        </div>
      ) : null}
    </div>
  );
}
