import type { SelectionAction } from "../../../components/ui/SelectionBar";
import {
  FloatingMenu,
  FloatingMenuHeading,
  FloatingMenuItem,
  FloatingMenuList,
  type FloatingMenuItemVariant,
  type FloatingPosition,
} from "../../floatingUi";

interface RegisterContextMenuProps {
  isOpen: boolean;
  position: Pick<FloatingPosition, "top" | "left"> | null;
  selectedCount: number;
  actions: SelectionAction[];
  onClose: () => void;
}

function resolveFloatingMenuItemVariant(
  variant: SelectionAction["variant"],
): FloatingMenuItemVariant {
  if (variant === "danger" || variant === "success") {
    return variant;
  }

  return "default";
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
        {actions.map((action) => (
          <FloatingMenuItem
            key={action.id}
            className="register-context-menu-item"
            icon={action.icon}
            variant={resolveFloatingMenuItemVariant(action.variant)}
            pressed={action.pressed}
            disabled={action.disabled}
            title={action.title}
            onClick={() => {
              onClose();
              action.onClick();
            }}
          >
            {action.label}
          </FloatingMenuItem>
        ))}
      </FloatingMenuList>
    </FloatingMenu>
  );
}
