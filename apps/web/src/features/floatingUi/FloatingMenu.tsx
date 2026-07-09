import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  RefObject,
} from "react";
import "./floatingMenu.css";

export interface FloatingMenuProps {
  isOpen: boolean;
  label: string;
  children: ReactNode;
  className?: string;
  layerClassName?: string;
  panelClassName?: string;
  position: {
    top: number;
    left: number;
  } | null;
  onClose: () => void;
  floatingRef?: RefObject<HTMLElement | null>;
}

function getFocusableMenuItems(menu: HTMLElement) {
  return Array.from(
    menu.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not(:disabled), button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled"));
}

function focusMenuItem(menu: HTMLElement, index: number) {
  const items = getFocusableMenuItems(menu);

  if (items.length === 0) {
    return;
  }

  const nextIndex = (index + items.length) % items.length;
  items[nextIndex]?.focus();
}

function resolveFocusedMenuItemIndex(menu: HTMLElement) {
  const items = getFocusableMenuItems(menu);
  return items.findIndex((item) => item === document.activeElement);
}

function handleFloatingMenuKeyDown(event: KeyboardEvent<HTMLElement>) {
  const menu = event.currentTarget;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    focusMenuItem(menu, resolveFocusedMenuItemIndex(menu) + 1);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    focusMenuItem(menu, resolveFocusedMenuItemIndex(menu) - 1);
    return;
  }

  if (event.key === "Home") {
    event.preventDefault();
    focusMenuItem(menu, 0);
    return;
  }

  if (event.key === "End") {
    event.preventDefault();
    focusMenuItem(menu, getFocusableMenuItems(menu).length - 1);
  }
}

export function FloatingMenu({
  isOpen,
  label,
  children,
  className,
  layerClassName = "floating-menu-layer",
  panelClassName = "floating-menu-panel",
  position,
  onClose,
  floatingRef,
}: FloatingMenuProps) {
  if (!isOpen || !position) {
    return null;
  }

  const panelStyle: CSSProperties = {
    top: position.top,
    left: position.left,
  };

  return (
    <div
      className={[layerClassName, className].filter(Boolean).join(" ")}
      role="presentation"
      onMouseDown={onClose}
      onContextMenu={(event: MouseEvent<HTMLElement>) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        className={panelClassName}
        role="menu"
        aria-label={label}
        style={panelStyle}
        ref={floatingRef as RefObject<HTMLDivElement> | undefined}
        tabIndex={-1}
        onKeyDown={handleFloatingMenuKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export interface FloatingMenuHeadingProps {
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}

export function FloatingMenuHeading({
  title,
  subtitle,
  className = "floating-menu-heading",
}: FloatingMenuHeadingProps) {
  return (
    <div className={className}>
      <strong>{title}</strong>
      {subtitle ? <span>{subtitle}</span> : null}
    </div>
  );
}

export interface FloatingMenuListProps {
  children: ReactNode;
  className?: string;
}

export function FloatingMenuList({
  children,
  className = "floating-menu-list",
}: FloatingMenuListProps) {
  return <div className={className}>{children}</div>;
}
