import type { KeyboardEvent, PointerEvent } from "react";

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
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onNudgeColumnWidth(columnId, -0.5);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      onNudgeColumnWidth(columnId, 0.5);
    }

    if (event.key === "Home") {
      event.preventDefault();
      onResetColumnWidth(columnId);
    }
  }

  return (
    <button
      className="table-layout-column-resize-handle"
      type="button"
      aria-label={`Resize ${label} column. Drag, use left and right arrow keys, or double-click to reset.`}
      title="Drag to resize. Use ←/→ to adjust. Double-click to reset width."
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
