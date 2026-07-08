import { X } from "lucide-react";
import type { SelectionAction } from "./SelectionAction";
import "./SelectionBar.css";

interface SelectionBarProps {
  selectionCount: number;
  actions: SelectionAction[];
  onClearSelection: () => void;
  itemLabel?: string;
  ariaLabel?: string;
}

function formatSelectionCount(selectionCount: number, itemLabel: string) {
  const normalisedItemLabel = itemLabel.trim() || "Item";
  return `${selectionCount} ${normalisedItemLabel}${selectionCount === 1 ? "" : "s"} Selected`;
}

export function SelectionBar({
  selectionCount,
  actions,
  onClearSelection,
  itemLabel = "Item",
  ariaLabel = "Selected item actions",
}: SelectionBarProps) {
  if (selectionCount <= 0) {
    return null;
  }

  return (
    <div className="selection-bar" role="toolbar" aria-label={ariaLabel}>
      <strong className="selection-bar-count">
        {formatSelectionCount(selectionCount, itemLabel)}
      </strong>

      <div className="selection-bar-actions">
        {actions.map((action) => {
          const Icon = action.icon;
          const variant = action.variant ?? "default";
          const className = [
            "selection-bar-button",
            variant !== "default" ? `selection-bar-button-${variant}` : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={action.id}
              className={className}
              type="button"
              aria-pressed={action.pressed}
              title={action.title}
              disabled={action.disabled}
              onClick={() => action.onClick()}
            >
              {Icon ? (
                <Icon className="selection-bar-button-icon" size={15} aria-hidden="true" />
              ) : null}
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>

      <button
        className="selection-bar-button selection-bar-dismiss"
        type="button"
        aria-label="Clear selection"
        onClick={onClearSelection}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
