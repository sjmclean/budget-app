import type { KeyboardEvent, PointerEvent } from "react";
import { getTableColumnResizeKeyAction } from "./tableLayoutResize";

export function ColumnResizeHandle<TColumnId extends string>({
  columnId,
  label,
  onResizeStart,
  onNudgeColumnWidth,
  onResetColumnWidth,
}: {
  columnId: TColumnId;
  label: string;
  onResizeStart: (columnId: TColumnId, startClientX: number) => void;
  onNudgeColumnWidth: (columnId: TColumnId, deltaRem: number) => void;
  onResetColumnWidth: (columnId: TColumnId) => void;
}) {
  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    onResizeStart(columnId, event.clientX);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const action = getTableColumnResizeKeyAction(event);

    if (!action) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (action.type === "reset") {
      onResetColumnWidth(columnId);
      return;
    }

    onNudgeColumnWidth(columnId, action.deltaRem);
  }

  return (
    <button
      className="table-layout-column-resize-handle"
      type="button"
      aria-label={`Resize ${label} column. Drag, use left and right arrow keys, hold Alt for fine adjustments, hold Shift for larger adjustments, or reset with Home or Enter.`}
      aria-keyshortcuts="ArrowLeft ArrowRight Alt+ArrowLeft Alt+ArrowRight Shift+ArrowLeft Shift+ArrowRight Home Enter"
      title="Drag to resize. Use ←/→ to adjust, Alt for fine steps, Shift for larger steps, Home/Enter to reset, or double-click to reset width."
      onPointerDown={handlePointerDown}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onResetColumnWidth(columnId);
      }}
      onKeyDown={handleKeyDown}
    >
      <span className="table-layout-column-resize-grip" aria-hidden="true">
        ⋮⋮
      </span>
    </button>
  );
}
