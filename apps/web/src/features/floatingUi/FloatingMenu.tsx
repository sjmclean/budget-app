import type { CSSProperties, MouseEvent, ReactNode, RefObject } from "react";

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
