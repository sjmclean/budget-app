import type { SelectionAction } from "../../../components/ui/SelectionBar";
import {
  FloatingMenu,
  FloatingMenuHeading,
  FloatingMenuList,
  type FloatingPosition,
} from "../../floatingUi";

interface RegisterContextMenuProps {
  isOpen: boolean;
  position: Pick<FloatingPosition, "top" | "left"> | null;
  selectedCount: number;
  actions: SelectionAction[];
  onClose: () => void;
}

export function RegisterContextMenu({
  isOpen,
  position,
  selectedCount,
  actions,
  onClose,
}: RegisterContextMenuProps) {
  return (
    <FloatingMenu
      isOpen={isOpen}
      label="Transaction actions"
      layerClassName="register-context-menu-layer floating-menu-layer"
      panelClassName="register-context-menu floating-menu-panel"
      position={position}
      onClose={onClose}
    >
      <FloatingMenuHeading
        className="register-context-menu-heading floating-menu-heading"
        title={selectedCount === 1 ? "Transaction" : `${selectedCount} transactions`}
        subtitle="Actions"
      />

      <FloatingMenuList className="register-context-menu-list floating-menu-list">
        {actions.map((action) => {
          const Icon = action.icon ?? null;

          return (
            <button
              key={action.id}
              className={[
                "register-context-menu-item",
                action.variant === "danger" ? "register-context-menu-item-danger" : "",
                action.variant === "success" ? "register-context-menu-item-success" : "",
                action.pressed ? "register-context-menu-item-pressed" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              role="menuitem"
              aria-pressed={action.pressed ?? undefined}
              disabled={action.disabled}
              title={action.title}
              onClick={() => {
                onClose();
                action.onClick();
              }}
            >
              {Icon ? <Icon size={15} aria-hidden="true" /> : null}
              <span>{action.label}</span>
            </button>
          );
        })}
      </FloatingMenuList>
    </FloatingMenu>
  );
}
