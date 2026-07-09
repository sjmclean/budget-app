export const TABLE_COLUMN_RESIZE_NUDGE_REM = 0.5;
export const TABLE_COLUMN_RESIZE_FINE_NUDGE_REM = 0.25;
export const TABLE_COLUMN_RESIZE_COARSE_NUDGE_REM = 1;

export type TableColumnResizeKeyAction =
  | { type: "nudge"; deltaRem: number }
  | { type: "reset" }
  | null;

interface TableColumnResizeKeyEventLike {
  key: string;
  altKey?: boolean;
  shiftKey?: boolean;
}

export function getTableColumnResizeNudgeRem(
  event: TableColumnResizeKeyEventLike,
) {
  if (event.shiftKey) {
    return TABLE_COLUMN_RESIZE_COARSE_NUDGE_REM;
  }

  if (event.altKey) {
    return TABLE_COLUMN_RESIZE_FINE_NUDGE_REM;
  }

  return TABLE_COLUMN_RESIZE_NUDGE_REM;
}

export function getTableColumnResizeKeyAction(
  event: TableColumnResizeKeyEventLike,
): TableColumnResizeKeyAction {
  if (event.key === "ArrowLeft") {
    return {
      type: "nudge",
      deltaRem: -getTableColumnResizeNudgeRem(event),
    };
  }

  if (event.key === "ArrowRight") {
    return {
      type: "nudge",
      deltaRem: getTableColumnResizeNudgeRem(event),
    };
  }

  if (event.key === "Home" || event.key === "Enter") {
    return { type: "reset" };
  }

  return null;
}
